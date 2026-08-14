import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loader as documentLoader } from '~/routes/edge-cms/public/legal-document';
import { loader as pdfLoader } from '~/routes/edge-cms/public/legal-document-pdf';
import { loader as keysLoader } from '~/routes/edge-cms/public/legal-keys';
import { loader as markdownLoader } from '~/routes/edge-cms/public/legal-markdown';
import { loader as immutableDocumentLoader } from '~/routes/edge-cms/public/legal-release';
import { loader as immutableMarkdownLoader } from '~/routes/edge-cms/public/legal-release-markdown';
import { loader as immutablePdfLoader } from '~/routes/edge-cms/public/legal-release-pdf';
import {
	activateLegalRelease,
	createLegalDocument,
	publishLegalDocument,
	retireLegalRelease,
	saveLegalDraft,
} from '~/utils/services/legal.server';
import {
	markLegalReleasePublished,
	saveLegalReleaseVariantArtifacts,
} from '~/utils/db.server';
import {
	parseLegalReleasePayload,
	signLegalReleasePayload,
} from '~/utils/legal-release.server';
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

async function seedActivePrivacyPolicy() {
	await seedLanguage('en', true);
	await seedLanguage('es', false);
	const document = await createLegalDocument({
		name: 'Privacy Policy',
		slug: 'privacy',
		type: 'privacy_policy',
	});
	if (!document.ok) throw new Error(document.error.message);
	await saveLegalDraft({
		documentId: document.data.id,
		locale: 'en',
		markdown: '# Privacy\n\nYour data is yours.',
	});
	const publication = await publishLegalDocument({
		documentId: document.data.id,
		version: '3.1',
		effectiveDate: '2026-09-01',
	});
	if (!publication.ok) throw new Error(publication.error.message);
	const variant = await env.DB.prepare(
		'SELECT id, payload FROM legal_release_variants WHERE releaseId = ?',
	)
		.bind(publication.data.releaseId)
		.first<{ id: number; payload: string }>();
	if (!variant) throw new Error('Expected frozen variant');
	const keys = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify'],
	);
	const signed = await signLegalReleasePayload(
		variant.payload,
		await crypto.subtle.exportKey('jwk', keys.privateKey),
	);
	const pdfKey = `legal/${document.data.id}/${publication.data.releaseId}/3.1/en.pdf`;
	await env.MEDIA_BUCKET.put(pdfKey, '%PDF test policy', {
		httpMetadata: { contentType: 'application/pdf' },
	});
	await saveLegalReleaseVariantArtifacts({
		variantId: variant.id,
		releaseHash: signed.releaseHash,
		signature: signed.signature,
		signingKeyId: 'legal-key-1',
		publicJwk: JSON.stringify(signed.publicJwk),
		pdfKey,
	});
	await markLegalReleasePublished(publication.data.releaseId);
	await activateLegalRelease(publication.data.releaseId);
	return {
		document: document.data,
		publication: publication.data,
		canonicalPayload: variant.payload,
		payload: parseLegalReleasePayload(variant.payload),
		signed,
	};
}

describe('public legal releases', () => {
	it('returns the exact active localized payload and its evidence', async () => {
		const seeded = await seedActivePrivacyPolicy();

		const response = await documentLoader({
			request: new Request('https://cms.test/edge-cms/public/legal/privacy/en'),
			params: { slug: 'privacy', locale: 'en' },
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			document: { slug: 'privacy', type: 'privacy_policy' },
			release: {
				version: '3.1',
				effectiveDate: '2026-09-01',
				locale: 'en',
			},
			payload: seeded.payload,
			canonicalPayload: seeded.canonicalPayload,
			releaseHash: seeded.signed.releaseHash,
			signature: seeded.signed.signature,
			signatureAlgorithm: 'ES256',
			signingKeyId: 'legal-key-1',
			markdownUrl: `/edge-cms/public/legal/privacy/en/releases/${seeded.signed.releaseHash}.md`,
			pdfUrl: `/edge-cms/public/legal/privacy/en/releases/${seeded.signed.releaseHash}.pdf`,
		});
		expect(response.headers.get('etag')).toBe(`"${seeded.signed.releaseHash}"`);
	});

	it('serves the active document as raw Markdown', async () => {
		await seedActivePrivacyPolicy();

		const response = await markdownLoader({
			request: new Request(
				'https://cms.test/edge-cms/public/legal/privacy/en.md',
			),
			params: { slug: 'privacy', locale: 'en' },
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/markdown');
		await expect(response.text()).resolves.toBe(
			'# Privacy\n\nYour data is yours.',
		);
	});

	it('keeps retired evidence, Markdown, and PDF at the release hash URL', async () => {
		const seeded = await seedActivePrivacyPolicy();
		await retireLegalRelease(seeded.publication.releaseId);
		const evidenceUrl = `https://cms.test/edge-cms/public/legal/privacy/en/releases/${seeded.signed.releaseHash}`;

		const evidence = await immutableDocumentLoader({
			request: new Request(evidenceUrl),
			params: {
				slug: 'privacy',
				locale: 'en',
				releaseHash: seeded.signed.releaseHash,
			},
		} as never);
		const pdf = await immutablePdfLoader({
			request: new Request(`${evidenceUrl}.pdf`),
			params: {
				slug: 'privacy',
				locale: 'en',
				releaseHash: seeded.signed.releaseHash,
			},
		} as never);
		const markdown = await immutableMarkdownLoader({
			request: new Request(`${evidenceUrl}.md`),
			params: {
				slug: 'privacy',
				locale: 'en',
				releaseHash: seeded.signed.releaseHash,
			},
		});

		expect(evidence.status).toBe(200);
		expect(evidence.headers.get('cache-control')).toContain('immutable');
		await expect(evidence.json()).resolves.toMatchObject({
			releaseHash: seeded.signed.releaseHash,
			canonicalPayload: seeded.canonicalPayload,
		});
		expect(pdf.status).toBe(200);
		expect(pdf.headers.get('cache-control')).toContain('immutable');
		expect(new TextDecoder().decode(await pdf.arrayBuffer())).toBe(
			'%PDF test policy',
		);
		expect(markdown.status).toBe(200);
		expect(markdown.headers.get('cache-control')).toContain('immutable');
		expect(markdown.headers.get('content-type')).toContain('text/markdown');
		await expect(markdown.text()).resolves.toBe(
			'# Privacy\n\nYour data is yours.',
		);
	});

	it('streams the active locale PDF', async () => {
		await seedActivePrivacyPolicy();

		const response = await pdfLoader({
			request: new Request(
				'https://cms.test/edge-cms/public/legal/privacy/en.pdf',
			),
			params: { slug: 'privacy', locale: 'en' },
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
			'%PDF test policy',
		);
	});

	it('does not silently fall back to another locale', async () => {
		await seedActivePrivacyPolicy();

		const response = await documentLoader({
			request: new Request('https://cms.test/edge-cms/public/legal/privacy/es'),
			params: { slug: 'privacy', locale: 'es' },
		} as never);

		expect(response.status).toBe(404);
	});

	it('publishes the verification keys used by release history', async () => {
		const seeded = await seedActivePrivacyPolicy();

		const response = await keysLoader({
			request: new Request('https://cms.test/edge-cms/public/legal/keys.json'),
			params: {},
		} as never);

		await expect(response.json()).resolves.toEqual({
			keys: [
				{
					keyId: 'legal-key-1',
					publicJwk: seeded.signed.publicJwk,
				},
			],
		});
	});
});
