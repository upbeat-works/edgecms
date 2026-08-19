import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activateLegalRelease,
	createLegalDocument,
	deleteLegalDocument,
	discardFailedLegalRelease,
	publishLegalDocument,
	retryLegalRelease,
	saveLegalDraft,
	updateLegalDocument,
} from '~/utils/services/legal.server';
import {
	getLegalReleaseVariants,
	markLegalReleaseFailed,
	markLegalReleasePublished,
	publishLegalReleaseAsCurrent,
	saveLegalReleaseVariantArtifacts,
} from '~/utils/db.server';
import { resetDb, seedLanguage } from '../helpers';

let restoreWorkflowSpy: () => void;

beforeEach(async () => {
	await resetDb();
	const workflowSpy = vi
		.spyOn(env.LEGAL_RELEASE_WORKFLOW, 'create')
		.mockResolvedValue({
			id: 'legal-publish-test',
		} as never);
	restoreWorkflowSpy = () => workflowSpy.mockRestore();
});

afterEach(() => restoreWorkflowSpy());

async function runWithoutLegalSigningKey<T>(
	operation: () => Promise<T>,
): Promise<T> {
	const descriptor = Object.getOwnPropertyDescriptor(
		env,
		'LEGAL_SIGNING_PRIVATE_JWK',
	);
	if (!descriptor) throw new Error('Legal signing test binding is missing');
	Object.defineProperty(env, 'LEGAL_SIGNING_PRIVATE_JWK', {
		configurable: true,
		value: undefined,
	});
	try {
		return await operation();
	} finally {
		Object.defineProperty(env, 'LEGAL_SIGNING_PRIVATE_JWK', descriptor);
	}
}

async function createPrivacyPolicy() {
	const result = await createLegalDocument({
		name: 'Privacy Policy',
		slug: 'Privacy Policy',
		type: 'privacy_policy',
	});
	if (!result.ok) throw new Error(result.error.message);
	return result.data;
}

describe('legal document drafts', () => {
	it('creates a document with a stable public slug', async () => {
		const result = await createLegalDocument({
			name: 'Subscription Terms',
			slug: ' Subscription Terms ',
			type: 'terms_and_conditions',
		});

		expect(result).toMatchObject({
			ok: true,
			data: { name: 'Subscription Terms', slug: 'subscription-terms' },
		});
	});

	it('saves exact Markdown only for a configured locale', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		const markdown = '# Privacy\r\n\r\n  Exact bytes stay exact.  \n';

		await expect(
			saveLegalDraft({ documentId: document.id, locale: 'fr', markdown }),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'LOCALE_NOT_FOUND' },
		});

		await expect(
			saveLegalDraft({ documentId: document.id, locale: 'en', markdown }),
		).resolves.toMatchObject({ ok: true });
		const row = await env.DB.prepare(
			'SELECT markdown FROM legal_document_drafts WHERE documentId = ? AND locale = ?',
		)
			.bind(document.id, 'en')
			.first<{ markdown: string }>();
		expect(row?.markdown).toBe(markdown);
	});

	it('deletes a document only before its first release', async () => {
		await seedLanguage('en', true);
		const disposable = await createPrivacyPolicy();
		await expect(deleteLegalDocument(disposable.id)).resolves.toMatchObject({
			ok: true,
		});

		const released = await createLegalDocument({
			name: 'Terms',
			slug: 'terms',
			type: 'terms_and_conditions',
		});
		if (!released.ok) throw new Error(released.error.message);
		await saveLegalDraft({
			documentId: released.data.id,
			locale: 'en',
			markdown: '# Terms',
		});
		await publishLegalDocument({
			documentId: released.data.id,
			version: '1.0',
			effectiveDate: '2026-09-01',
		});

		await expect(deleteLegalDocument(released.data.id)).resolves.toMatchObject({
			ok: false,
			error: { code: 'LEGAL_DOCUMENT_HAS_RELEASES' },
		});
	});

	it('keeps signed document identity stable after release history begins', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		await publishLegalDocument({
			documentId: document.id,
			version: '1.0',
			effectiveDate: '2026-09-01',
		});

		await expect(
			updateLegalDocument({
				documentId: document.id,
				name: 'Privacy notice',
				slug: 'privacy-notice',
				type: 'privacy_policy',
			}),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'LEGAL_DOCUMENT_IDENTITY_FROZEN' },
		});
		await expect(
			updateLegalDocument({
				documentId: document.id,
				name: 'Privacy notice',
				slug: document.slug,
				type: document.type,
			}),
		).resolves.toMatchObject({
			ok: true,
			data: { name: 'Privacy notice' },
		});
	});
});

describe('legal releases', () => {
	it('discards a failed release and its partial PDF artifacts', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		const publication = await publishLegalDocument({
			documentId: document.id,
			version: '2026-09-01',
			effectiveDate: '2026-09-01',
		});
		if (!publication.ok) throw new Error(publication.error.message);
		const artifactKey = `legal/${document.id}/${publication.data.releaseId}/2026-09-01/en.pdf`;
		await env.MEDIA_BUCKET.put(artifactKey, '%PDF partial');
		await markLegalReleaseFailed(
			publication.data.releaseId,
			'PDF rendering failed',
		);

		const result = await discardFailedLegalRelease({
			documentId: document.id,
			releaseId: publication.data.releaseId,
		});

		expect(result).toMatchObject({ ok: true });
		await expect(env.MEDIA_BUCKET.head(artifactKey)).resolves.toBeNull();
		const row = await env.DB.prepare(
			'SELECT id FROM legal_releases WHERE id = ?',
		)
			.bind(publication.data.releaseId)
			.first();
		expect(row).toBeNull();
	});

	it('does not freeze a release when legal signing is not configured', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});

		const result = await runWithoutLegalSigningKey(() =>
			publishLegalDocument({
				documentId: document.id,
				version: '2026-09-01',
				effectiveDate: '2026-09-01',
			}),
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: 'LEGAL_SIGNING_NOT_CONFIGURED', status: 503 },
		});
		const row = await env.DB.prepare(
			'SELECT COUNT(*) AS count FROM legal_releases',
		).first<{ count: number }>();
		expect(row?.count).toBe(0);
	});

	it('keeps a failed release retryable when legal signing is unavailable', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		const publication = await publishLegalDocument({
			documentId: document.id,
			version: '2026-09-01',
			effectiveDate: '2026-09-01',
		});
		if (!publication.ok) throw new Error(publication.error.message);
		await markLegalReleaseFailed(publication.data.releaseId, 'PDF failed');

		const result = await runWithoutLegalSigningKey(() =>
			retryLegalRelease(publication.data.releaseId),
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: 'LEGAL_SIGNING_NOT_CONFIGURED', status: 503 },
		});
		const row = await env.DB.prepare(
			'SELECT status FROM legal_releases WHERE id = ?',
		)
			.bind(publication.data.releaseId)
			.first<{ status: string }>();
		expect(row?.status).toBe('failed');
	});

	it('makes each completed publication current and replaces the previous one', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});

		const first = await publishLegalDocument({
			documentId: document.id,
			version: '2026-09-01',
			effectiveDate: '2026-09-01',
		});
		if (!first.ok) throw new Error(first.error.message);
		await publishLegalReleaseAsCurrent(first.data.releaseId);

		const second = await publishLegalDocument({
			documentId: document.id,
			version: '2026-10-01',
			effectiveDate: '2026-10-01',
		});
		if (!second.ok) throw new Error(second.error.message);
		await publishLegalReleaseAsCurrent(second.data.releaseId);

		const releases = await env.DB.prepare(
			'SELECT id, status, publishedAt, activatedAt FROM legal_releases ORDER BY id',
		).all<{
			id: number;
			status: string;
			publishedAt: string | null;
			activatedAt: string | null;
		}>();
		expect(releases.results).toMatchObject([
			{ id: first.data.releaseId, status: 'retired' },
			{
				id: second.data.releaseId,
				status: 'active',
				publishedAt: expect.any(String),
				activatedAt: expect.any(String),
			},
		]);
	});

	it('freezes every non-empty locale variant when publication starts', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		await saveLegalDraft({
			documentId: document.id,
			locale: 'es',
			markdown: '# Privacidad',
		});

		const result = await publishLegalDocument({
			documentId: document.id,
			version: '2026-09',
			effectiveDate: '2026-09-01',
		});

		expect(result).toMatchObject({
			ok: true,
			data: { releaseId: expect.any(Number), publishId: expect.any(String) },
		});
		if (!result.ok) return;
		const variants = await env.DB.prepare(
			'SELECT locale, payload FROM legal_release_variants WHERE releaseId = ? ORDER BY locale',
		)
			.bind(result.data.releaseId)
			.all<{ locale: string; payload: string }>();
		expect(variants.results).toHaveLength(2);
		expect(JSON.parse(variants.results[0].payload)).toMatchObject({
			locale: 'en',
			version: '2026-09',
			markdown: '# Privacy',
		});
	});

	it('requires a non-empty default-locale draft', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'es',
			markdown: '# Privacidad',
		});

		await expect(
			publishLegalDocument({
				documentId: document.id,
				version: '1.0',
				effectiveDate: '2026-09-01',
			}),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'DEFAULT_LEGAL_DRAFT_REQUIRED' },
		});
	});

	it('requires an exact calendar date for the signed effective date', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});

		await expect(
			publishLegalDocument({
				documentId: document.id,
				version: '1.0',
				effectiveDate: 'September 1, 2026',
			}),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'VALIDATION_ERROR' },
		});
	});

	it('rejects activation until every release artifact is complete', async () => {
		await seedLanguage('en', true);
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		const first = await publishLegalDocument({
			documentId: document.id,
			version: '1',
			effectiveDate: '2026-09-01',
		});
		if (!first.ok) throw new Error(first.error.message);
		await markLegalReleasePublished(first.data.releaseId);

		await expect(
			activateLegalRelease(first.data.releaseId),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'LEGAL_RELEASE_ARTIFACTS_INCOMPLETE' },
		});
		const row = await env.DB.prepare(
			'SELECT status FROM legal_releases WHERE id = ?',
		)
			.bind(first.data.releaseId)
			.first<{ status: string }>();
		expect(row?.status).toBe('published');
	});

	it('rejects a partially signed multilingual release', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es');
		const document = await createPrivacyPolicy();
		await saveLegalDraft({
			documentId: document.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		await saveLegalDraft({
			documentId: document.id,
			locale: 'es',
			markdown: '# Privacidad',
		});
		const publication = await publishLegalDocument({
			documentId: document.id,
			version: '1',
			effectiveDate: '2026-09-01',
		});
		if (!publication.ok) throw new Error(publication.error.message);
		const [english] = await getLegalReleaseVariants(publication.data.releaseId);
		if (!english) throw new Error('Expected an English release variant');
		await saveLegalReleaseVariantArtifacts({
			variantId: english.id,
			releaseHash: 'a'.repeat(64),
			signature: 'signed',
			signingKeyId: 'legal-key',
			publicJwk: '{"kty":"EC"}',
			pdfKey: 'legal/privacy/en.pdf',
		});
		await markLegalReleasePublished(publication.data.releaseId);

		await expect(
			activateLegalRelease(publication.data.releaseId),
		).resolves.toMatchObject({
			ok: false,
			error: { code: 'LEGAL_RELEASE_ARTIFACTS_INCOMPLETE' },
		});
		const policies = await env.DB.prepare(
			'SELECT COUNT(*) AS count FROM c15t_consentPolicy',
		).first<{ count: number }>();
		expect(policies?.count).toBe(0);
	});
});
