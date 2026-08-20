import {
	createExecutionContext,
	env,
	introspectWorkflow,
} from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeCMSService } from '../workers/edgecms-service';
import { getLanguages } from '~/utils/db/languages.server';
import { createVersion } from '~/utils/db/versions.server';
import { upsertTranslation } from '~/utils/db/translations.server';
import {
	resetDb,
	seedActiveLegalDocument,
	seedBlockCollection,
	seedLanguage,
	seedMedia,
} from './helpers';

function service() {
	return new EdgeCMSService(createExecutionContext(), env);
}

beforeEach(async () => {
	await resetDb();
	vi.restoreAllMocks();
});

describe('languages over RPC', () => {
	it('creates a language without an API key', async () => {
		const result = await service().createLanguage('pt-BR');

		expect(result).toEqual({ locale: 'pt-BR', default: true });
		expect(await getLanguages()).toEqual([{ locale: 'pt-BR', default: true }]);
	});

	it('lists languages', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);

		await expect(service().getLanguages()).resolves.toEqual({
			languages: [
				{ locale: 'en', default: true },
				{ locale: 'es', default: false },
			],
			defaultLocale: 'en',
		});
	});

	it('changes the default language', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);

		await service().setDefaultLanguage('es');

		expect(await getLanguages()).toEqual([
			{ locale: 'en', default: false },
			{ locale: 'es', default: true },
		]);
	});

	// REST callers get a status code; RPC callers get a throw carrying the same
	// machine-readable code.
	it('throws with the REST error code when the locale already exists', async () => {
		await seedLanguage('en', true);

		await expect(service().createLanguage('en')).rejects.toMatchObject({
			name: 'LOCALE_EXISTS',
		});
	});

	it('throws when setting a default that does not exist', async () => {
		await expect(service().setDefaultLanguage('de')).rejects.toMatchObject({
			name: 'LOCALE_NOT_FOUND',
		});
	});
});

describe('legal consent over RPC', () => {
	it('returns the active document and records its acceptance', async () => {
		const seeded = await seedActiveLegalDocument();
		const svc = service();

		const legalDocument = await svc.getLegalDocument('privacy', 'en');
		expect(legalDocument).toMatchObject({
			releaseHash: seeded.signed.releaseHash,
			consent: {
				type: 'privacy_policy_privacy',
				documentSnapshotToken: expect.any(String),
			},
		});

		const receipt = await svc.recordLegalConsent({
			type: legalDocument.consent.type,
			documentSnapshotToken: legalDocument.consent.documentSnapshotToken,
			subjectId: 'sub_3jv6z8n4q9',
			domain: 'worker.example',
			ipAddress: '198.51.100.42',
			userAgent: 'customer-worker/1.0',
			uiSource: 'signup',
		});
		expect(receipt).toMatchObject({
			subjectId: 'sub_3jv6z8n4q9',
			consentId: expect.stringMatching(/^cns_/u),
			domain: 'worker.example',
			type: 'privacy_policy_privacy',
			metadata: {
				edgecmsLegalDocument: {
					locale: 'en',
					documentHash: seeded.signed.releaseHash,
				},
			},
			uiSource: 'signup',
		});

		await expect(
			svc.identifyLegalConsentSubject({
				subjectId: receipt.subjectId,
				externalId: 'user_84',
				identityProvider: 'worker-auth',
				ipAddress: '198.51.100.42',
				userAgent: 'customer-worker/1.0',
			}),
		).resolves.toEqual({
			success: true,
			subject: {
				id: 'sub_3jv6z8n4q9',
				externalId: 'user_84',
			},
		});

		await expect(
			env.DB.prepare(
				`SELECT ipAddress, userAgent, uiSource, consentAction
				 FROM c15t_consent WHERE subjectId = ?`,
			)
				.bind('sub_3jv6z8n4q9')
				.first(),
		).resolves.toEqual({
			ipAddress: '198.51.100.0',
			userAgent: 'customer-worker/1.0',
			uiSource: 'signup',
			consentAction: null,
		});
		await expect(
			env.DB.prepare(
				`SELECT subject.externalId, subject.identityProvider,
					audit.actionType, audit.ipAddress, audit.userAgent
				 FROM c15t_subject AS subject
				 JOIN c15t_auditLog AS audit ON audit.subjectId = subject.id
				 WHERE subject.id = ?`,
			)
				.bind('sub_3jv6z8n4q9')
				.first(),
		).resolves.toEqual({
			externalId: 'user_84',
			identityProvider: 'worker-auth',
			actionType: 'identify_user',
			ipAddress: '198.51.100.0',
			userAgent: 'customer-worker/1.0',
		});
	});

	it('rejects a forged document capability', async () => {
		await expect(
			service().recordLegalConsent({
				type: 'privacy_policy_privacy',
				documentSnapshotToken: 'forged',
				subjectId: 'sub_4jv6z8n4q9',
				domain: 'worker.example',
				ipAddress: '198.51.100.42',
				userAgent: 'customer-worker/1.0',
				uiSource: 'signup',
			}),
		).rejects.toMatchObject({ name: 'LEGAL_DOCUMENT_SNAPSHOT_INVALID' });
	});

	it('requires request evidence from the calling Worker', async () => {
		await seedActiveLegalDocument();
		const legalDocument = await service().getLegalDocument('privacy', 'en');

		await expect(
			service().recordLegalConsent({
				type: legalDocument.consent.type,
				documentSnapshotToken: legalDocument.consent.documentSnapshotToken,
				subjectId: 'sub_5jv6z8n4q9',
				domain: 'worker.example',
				ipAddress: '',
				userAgent: 'customer-worker/1.0',
				uiSource: 'signup',
			}),
		).rejects.toMatchObject({
			name: 'INPUT_VALIDATION_FAILED',
			message: 'ipAddress is required for RPC legal consent',
		});

		const stored = await env.DB.prepare(
			'SELECT COUNT(*) AS count FROM c15t_consent WHERE subjectId = ?',
		)
			.bind('sub_5jv6z8n4q9')
			.first<{ count: number }>();
		expect(stored?.count).toBe(0);
	});
});

describe('authoring blocks over RPC', () => {
	it('creates a schema and a collection bound to it', async () => {
		const svc = service();

		await svc.applyBlockSchema('hero', [
			{ name: 'title', type: 'translation' },
		]);
		await svc.createBlockCollection({ name: 'homepage-hero', schema: 'hero' });

		await expect(svc.getBlockCollections()).resolves.toEqual([
			{
				name: 'homepage-hero',
				schema: 'hero',
				section: 'homepage-hero',
				singleton: false,
				instanceCount: 0,
			},
		]);
	});

	it('throws with the REST error code for an unknown schema', async () => {
		await expect(
			service().createBlockCollection({
				name: 'homepage-hero',
				schema: 'hero',
			}),
		).rejects.toMatchObject({ name: 'SCHEMA_NOT_FOUND' });
	});
});

describe('deleting translation keys over RPC', () => {
	it('is a dry run unless the caller opts out', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.hero.title', 'en', 'Hello');

		await expect(
			service().deleteTranslationKeys(['home.hero.title']),
		).resolves.toMatchObject({ dryRun: true, deleted: ['home.hero.title'] });

		await expect(service().pullTranslations()).resolves.toMatchObject({
			translations: { en: { 'home.hero.title': 'Hello' } },
		});
	});

	it('deletes when asked to', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.hero.title', 'en', 'Hello');

		await service().deleteTranslationKeys(['home.hero.title'], {
			dryRun: false,
		});

		await expect(service().pullTranslations()).resolves.toMatchObject({
			translations: { en: {} },
		});
	});
});

describe('publishing over RPC', () => {
	it('starts a release and returns its id', async () => {
		await seedLanguage('en', true);
		const draft = await createVersion('some changes');
		vi.spyOn(env.RELEASE_VERSION_WORKFLOW, 'create').mockResolvedValue({
			id: 'wf_rpc',
		} as never);

		await expect(service().publish()).resolves.toEqual({
			publishId: 'wf_rpc',
			versionId: draft.id,
		});
	});

	it('throws when there is nothing to publish', async () => {
		await seedLanguage('en', true);

		await expect(service().publish()).rejects.toMatchObject({
			name: 'NO_DRAFT',
		});
	});

	it('reports release status', async () => {
		vi.spyOn(env.RELEASE_VERSION_WORKFLOW, 'get').mockResolvedValue({
			status: async () => ({ status: 'complete' }),
		} as never);

		await expect(service().publishStatus('wf_rpc')).resolves.toEqual({
			publishId: 'wf_rpc',
			status: 'complete',
			error: null,
		});
	});
});

describe('reading published content over RPC', () => {
	async function publishAndWait(svc: EdgeCMSService) {
		await using _workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		const { publishId } = await svc.publish();
		const instances = await _workflow.get();
		if (instances.length !== 1) {
			throw new Error(`Expected one publish instance, got ${instances.length}`);
		}
		await instances[0].waitForStatus('complete');
		return { publishId, status: 'complete' };
	}

	it('serves the locale file written by a real publish', async () => {
		const svc = service();
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('some changes');

		await expect(publishAndWait(svc)).resolves.toMatchObject({
			status: 'complete',
		});

		await expect(svc.getTranslations('en')).resolves.toEqual({
			'home.title': 'Welcome',
		});
	});

	it('throws a coded error before anything has been published', async () => {
		await seedLanguage('en', true);

		await expect(service().getTranslations('en')).rejects.toMatchObject({
			name: 'NO_LIVE_VERSION',
		});
	});

	it('throws a coded error for a locale with no published file', async () => {
		const svc = service();
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('some changes');
		await publishAndWait(svc);

		await expect(svc.getTranslations('de')).rejects.toMatchObject({
			name: 'LOCALE_NOT_FOUND',
		});
	});

	it('throws a coded error for an unknown block collection', async () => {
		await expect(service().getBlocks('nope')).rejects.toMatchObject({
			name: 'COLLECTION_NOT_FOUND',
		});
	});

	it('serves blocks from D1 before anything has been published', async () => {
		await seedBlockCollection('hero', 'Welcome home');

		const data = (await service().getBlocks('hero')) as {
			collection: string;
			items: { heading: string }[];
		};

		expect(data.collection).toBe('hero');
		expect(data.items).toHaveLength(1);
		expect(data.items[0].heading).toBe('Welcome home');
	});

	it('serves blocks from the snapshot once published', async () => {
		const svc = service();
		await seedLanguage('en', true);
		await seedBlockCollection('hero', 'Welcome home');
		await createVersion('some changes');
		await publishAndWait(svc);

		const data = (await svc.getBlocks('hero')) as {
			items: { heading: string }[];
		};

		expect(data.items[0].heading).toBe('Welcome home');
	});

	// A collection created after the last publish has no snapshot. Falling back
	// to D1 here would leak unpublished content to every consumer.
	it('refuses to serve a collection created after the last publish', async () => {
		const svc = service();
		await seedLanguage('en', true);
		await createVersion('some changes');
		await publishAndWait(svc);

		await seedBlockCollection('added-later', 'Draft only');

		await expect(svc.getBlocks('added-later')).rejects.toMatchObject({
			name: 'COLLECTION_NOT_FOUND',
		});
	});

	it('throws a coded error for unknown media', async () => {
		await expect(service().getMedia('nope.png')).rejects.toMatchObject({
			name: 'MEDIA_NOT_FOUND',
		});
	});

	it('returns media metadata and a readable body', async () => {
		await seedMedia('logo.png', 'pretend-png-bytes', 'image/png');

		const media = await service().getMedia('logo.png');

		expect(media).toMatchObject({
			contentType: 'image/png',
			size: 'pretend-png-bytes'.length,
		});
		expect(media.etag).toEqual(expect.any(String));
		await expect(new Response(media.body).text()).resolves.toBe(
			'pretend-png-bytes',
		);
	});

	it('throws when the media row exists but its file is gone from R2', async () => {
		const row = await seedMedia('orphan.png');
		const { buildVersionedFilename } = await import('~/utils/media.server');
		await env.MEDIA_BUCKET.delete(
			buildVersionedFilename(row.filename, row.version),
		);

		await expect(service().getMedia('orphan.png')).rejects.toMatchObject({
			name: 'MEDIA_NOT_FOUND',
		});
	});

	it('reports a null default locale when none is set', async () => {
		await seedLanguage('en', false);

		await expect(service().pullTranslations()).resolves.toMatchObject({
			defaultLocale: null,
		});
	});

	it('pulls draft translations grouped by locale', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', 'Bienvenido');

		await expect(service().pullTranslations()).resolves.toEqual({
			languages: [
				{ locale: 'en', default: true },
				{ locale: 'es', default: false },
			],
			defaultLocale: 'en',
			translations: {
				en: { 'home.title': 'Welcome' },
				es: { 'home.title': 'Bienvenido' },
			},
		});
	});

	// Draft edits must not leak to RPC readers before they are published.
	it('keeps serving the published file after a later draft edit', async () => {
		const svc = service();
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('some changes');
		await publishAndWait(svc);

		await upsertTranslation('home.title', 'en', 'Changed in draft');

		await expect(svc.getTranslations('en')).resolves.toEqual({
			'home.title': 'Welcome',
		});
	});
});

describe('missing translations over RPC', () => {
	it('reports untranslated keys', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');

		const result = await service().missingTranslations();

		expect(result).toMatchObject({
			defaultLocale: 'en',
			totalMissing: 1,
		});
	});

	it('returns values that survive RPC serialization', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');

		const result = await service().missingTranslations();

		// RPC return values must be structured-cloneable.
		expect(() => structuredClone(result)).not.toThrow();
	});
});

describe('stale translations over RPC', () => {
	it('reports translations the default locale has moved on from', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', 'Bienvenido');

		await upsertTranslation('home.title', 'en', 'Welcome back');

		const result = await service().staleTranslations();

		expect(result).toMatchObject({
			defaultLocale: 'en',
			totalStale: 1,
			locales: {
				es: {
					staleCount: 1,
					keys: [
						{
							key: 'home.title',
							defaultValue: 'Welcome back',
							currentValue: 'Bienvenido',
						},
					],
				},
			},
		});
	});
});
