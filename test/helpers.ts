import { env } from 'cloudflare:test';
import { createAuth } from '~/utils/auth.server';

/**
 * Empty the R2 buckets between tests.
 *
 * Release artefacts are keyed by version id, and truncating `versions` resets
 * the autoincrement — so without this, every test's version 1 collides with the
 * previous test's version 1, and a rollback restores another test's catalogue.
 */
export async function resetBuckets() {
	for (const bucket of [env.BACKUPS_BUCKET, env.MEDIA_BUCKET]) {
		let cursor: string | undefined;
		do {
			const listing = await bucket.list({ cursor });
			if (listing.objects.length > 0) {
				await bucket.delete(listing.objects.map(object => object.key));
			}
			cursor = listing.truncated ? listing.cursor : undefined;
		} while (cursor);
	}
}

/**
 * Truncate application + auth tables between tests, and clear the buckets their
 * rows point at. Order matters: children before parents, since D1 enforces
 * foreign keys.
 */
export async function resetDb() {
	const tables = [
		'private_c15t_settings',
		'c15t_auditLog',
		'c15t_consent',
		'c15t_consentPurpose',
		'c15t_runtimePolicyDecision',
		'c15t_consentPolicy',
		'c15t_domain',
		'c15t_subject',
		'legal_release_variants',
		'legal_releases',
		'legal_document_drafts',
		'legal_documents',
		'block_instance_values',
		'block_instances',
		'block_collections',
		'block_schema_properties',
		'block_schemas',
		'translations',
		'translation_keys',
		'media',
		'sections',
		'languages',
		'versions',
		'apikey',
		'session',
		'account',
		'user',
	];

	for (const table of tables) {
		await env.DB.prepare(`DELETE FROM ${table}`).run();
	}

	await resetBuckets();
}

/**
 * Create a real user row. Uses the auth tables directly rather than the signup
 * flow, which needs a full HTTP round trip we don't otherwise care about.
 */
export async function createUser(
	overrides: { id?: string; email?: string; role?: 'admin' | 'user' } = {},
) {
	const id = overrides.id ?? `user_${crypto.randomUUID()}`;
	const email = overrides.email ?? `${id}@example.test`;
	const now = Date.now();

	await env.DB.prepare(
		'INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
	)
		.bind(id, email, 1, 'Test User', now, now, overrides.role ?? 'admin')
		.run();

	return { id, email };
}

/**
 * Issue a real API key through better-auth, so tests exercise the same
 * verification path as production rather than a stubbed middleware.
 */
export async function createApiKey(userId?: string): Promise<string> {
	const user = userId ? { id: userId } : await createUser();
	const auth = createAuth(env);

	const result = await auth.api.createApiKey({
		body: { name: 'test-key', userId: user.id },
	});

	return result.key;
}

/** Build a Request carrying a valid API key. */
export function apiRequest(
	url: string,
	apiKey: string,
	init: RequestInit = {},
): Request {
	return new Request(`https://cms.test${url}`, {
		...init,
		headers: {
			'x-api-key': apiKey,
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...(init.headers as Record<string, string>),
		},
	});
}

/**
 * Sign a new admin user in and return the cookie header that proves it.
 *
 * Goes through real sign-up rather than inserting rows: the session token is
 * HMAC-signed with `AUTH_SECRET`, so a hand-built cookie is rejected, and
 * `createUser` writes no `account` row for a password to live in.
 */
export async function signIn(): Promise<string> {
	const auth = createAuth(env, 'admin');
	const email = `user_${crypto.randomUUID()}@example.test`;

	const { headers } = await auth.api.signUpEmail({
		body: {
			email,
			password: 'correct-horse-battery-staple',
			name: 'Test User',
		},
		returnHeaders: true,
	});

	return headers
		.getSetCookie()
		.map(cookie => cookie.split(';')[0])
		.join('; ');
}

/** Build a Request carrying a signed-in session. */
export function authedRequest(
	url: string,
	cookie: string,
	init: RequestInit = {},
): Request {
	return new Request(`https://cms.test${url}`, {
		...init,
		headers: {
			cookie,
			...(init.headers as Record<string, string>),
		},
	});
}

/**
 * Build a one-property block collection holding a single item, using the same
 * data-layer calls the UI does.
 */
export async function seedBlockCollection(
	collectionName: string,
	value = 'Hello',
) {
	const {
		createBlockSchema,
		createBlockSchemaProperty,
		createBlockCollection,
	} = await import('~/utils/db/blocks.server');
	const { createBlockInstance, upsertBlockInstanceValue } =
		await import('~/utils/db/blocks.server');

	const schema = await createBlockSchema(`${collectionName}-schema`);
	const property = await createBlockSchemaProperty({
		schemaId: schema.id,
		name: 'heading',
		type: 'string',
	});
	const collection = await createBlockCollection({
		name: collectionName,
		schemaId: schema.id,
	});
	const instance = await createBlockInstance({
		schemaId: schema.id,
		collectionId: collection.id,
	});
	await upsertBlockInstanceValue({
		instanceId: instance.id,
		propertyId: property.id,
		stringValue: value,
	});

	return { schema, collection, instance };
}

/** Seed a media row plus its backing R2 object. */
export async function seedMedia(
	filename: string,
	body = 'binary-ish content',
	mimeType = 'image/png',
) {
	const { createMedia } = await import('~/utils/db/media.server');
	const { buildVersionedFilename } = await import('~/utils/media.server');

	const row = await createMedia({
		filename,
		mimeType,
		sizeBytes: body.length,
	});
	await env.MEDIA_BUCKET.put(
		buildVersionedFilename(row.filename, row.version),
		body,
	);

	return row;
}

/** Seed a language row directly. */
export async function seedLanguage(locale: string, isDefault = false) {
	await env.DB.prepare(
		'INSERT INTO languages (locale, "default") VALUES (?, ?)',
	)
		.bind(locale, isDefault ? 1 : 0)
		.run();
}

export async function seedActiveLegalDocument(
	overrides: {
		name?: string;
		slug?: string;
		type?:
			| 'terms_and_conditions'
			| 'privacy_policy'
			| 'cookie_policy'
			| 'dpa'
			| 'other';
		locale?: string;
		version?: string;
		effectiveDate?: string;
		markdown?: string;
		variants?: Array<{ locale: string; markdown: string }>;
	} = {},
) {
	const { createLegalDocument, saveLegalDraft } =
		await import('~/utils/services/legal.server');
	const { createFrozenLegalRelease, saveLegalReleaseVariantArtifacts } =
		await import('~/utils/db/legal.server');
	const {
		parseLegalSigningPrivateJwk,
		serializeLegalReleasePayload,
		signLegalReleasePayload,
	} = await import('~/utils/legal-release.server');

	const locale = overrides.locale ?? 'en';
	const version = overrides.version ?? '2026-08-19';
	const effectiveDate = overrides.effectiveDate ?? '2026-08-19';
	const variants = overrides.variants ?? [
		{
			locale,
			markdown: overrides.markdown ?? '# Privacy\n\nYour data is yours.',
		},
	];
	for (const [index, variant] of variants.entries()) {
		await seedLanguage(variant.locale, index === 0);
	}

	const created = await createLegalDocument({
		name: overrides.name ?? 'Privacy Policy',
		slug: overrides.slug ?? 'privacy',
		type: overrides.type ?? 'privacy_policy',
	});
	if (!created.ok) throw new Error(created.error.message);

	for (const variant of variants) {
		const draft = await saveLegalDraft({
			documentId: created.data.id,
			locale: variant.locale,
			markdown: variant.markdown,
		});
		if (!draft.ok) throw new Error(draft.error.message);
	}

	const payloads = variants.map(variant => ({
		locale: variant.locale,
		payload: serializeLegalReleasePayload({
			documentId: created.data.id,
			slug: created.data.slug,
			type: created.data.type,
			locale: variant.locale,
			version,
			effectiveDate,
			markdown: variant.markdown,
		}),
	}));
	const release = await createFrozenLegalRelease({
		documentId: created.data.id,
		version,
		effectiveDate,
		variants: payloads,
	});
	const frozenVariants = await env.DB.prepare(
		'SELECT id, locale FROM legal_release_variants WHERE releaseId = ? ORDER BY locale',
	)
		.bind(release.id)
		.all<{ id: number; locale: string }>()
		.then(result => result.results);
	const signingKey = parseLegalSigningPrivateJwk(env.LEGAL_SIGNING_PRIVATE_JWK);
	const signedVariants = [];
	for (const frozenVariant of frozenVariants) {
		const frozenPayload = payloads.find(
			entry => entry.locale === frozenVariant.locale,
		);
		if (!frozenPayload)
			throw new Error('Expected a frozen legal release payload');
		const signed = await signLegalReleasePayload(
			frozenPayload.payload,
			signingKey,
		);
		const pdfKey = `legal/${created.data.id}/${release.id}/${version}/${frozenVariant.locale}.pdf`;
		await env.MEDIA_BUCKET.put(pdfKey, '%PDF test legal document', {
			httpMetadata: { contentType: 'application/pdf' },
		});
		await saveLegalReleaseVariantArtifacts({
			variantId: frozenVariant.id,
			releaseHash: signed.releaseHash,
			signature: signed.signature,
			signingKeyId: env.LEGAL_SIGNING_KEY_ID,
			publicJwk: JSON.stringify(signed.publicJwk),
			pdfKey,
		});
		signedVariants.push({
			locale: frozenVariant.locale,
			payload: frozenPayload.payload,
			signed,
		});
	}
	const primary = signedVariants.find(variant => variant.locale === locale);
	if (!primary) throw new Error('Expected a primary legal release variant');
	const { activateLegalReleaseWithConsentPolicy } =
		await import('~/utils/legal-consent.server');
	await activateLegalReleaseWithConsentPolicy(env, release.id);

	return {
		document: created.data,
		release,
		locale,
		payload: primary.payload,
		signed: primary.signed,
		variants: signedVariants,
	};
}
