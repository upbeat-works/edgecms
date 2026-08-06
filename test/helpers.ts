import { env } from 'cloudflare:test';
import { createAuth } from '~/utils/auth.server';

/**
 * Truncate application + auth tables between tests. Order matters: children
 * before parents, since D1 enforces foreign keys.
 */
export async function resetDb() {
	const tables = [
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
