import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/blocks.collections';
import { action as schemaAction } from '~/routes/edge-cms/api/blocks.schemas';
import {
	createBlockSchema,
	getBlockCollectionByName,
	getBlockCollections,
	getBlockInstances,
} from '~/utils/db/blocks.server';
import { getSections } from '~/utils/db/sections.server';
import { getExistingTranslationKeys } from '~/utils/db/translations.server';
import { getLatestVersion } from '~/utils/db/versions.server';
import { apiRequest, createApiKey, resetDb } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

function post(body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/blocks/collections', apiKey, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	} as never);
}

function seedSchema(body: unknown) {
	return schemaAction({
		request: apiRequest('/edge-cms/api/blocks/schemas', apiKey, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	} as never);
}

describe('creating a collection', () => {
	beforeEach(async () => {
		await seedSchema({
			name: 'hero',
			properties: [{ name: 'title', type: 'translation' }],
		});
	});

	it('creates a collection bound to the named schema', async () => {
		const response = await post({ name: 'homepage-hero', schema: 'hero' });

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			name: 'homepage-hero',
			schema: 'hero',
			section: 'homepage-hero',
			singleton: false,
			created: true,
			updated: false,
			instanceCount: 0,
		});

		const collection = await getBlockCollectionByName('homepage-hero');
		expect(collection).toMatchObject({
			schemaName: 'hero',
			isCollection: true,
		});
	});

	it('names a section after the collection, or uses the one given', async () => {
		await post({ name: 'homepage-hero', schema: 'hero' });
		await post({ name: 'features', schema: 'hero', section: 'home' });

		expect((await getSections()).map(s => s.name).sort()).toEqual([
			'home',
			'homepage-hero',
		]);
		expect(await getBlockCollectionByName('features')).toMatchObject({
			section: 'home',
		});
	});

	it('gives a singleton its one instance immediately', async () => {
		const response = await post({
			name: 'site-footer',
			schema: 'hero',
			singleton: true,
		});

		await expect(response.json()).resolves.toMatchObject({
			singleton: true,
			instanceCount: 1,
		});

		const collection = await getBlockCollectionByName('site-footer');
		expect(await getBlockInstances(collection!.id)).toHaveLength(1);
	});

	it('registers translation keys for a singleton instance', async () => {
		await post({ name: 'site-footer', schema: 'hero', singleton: true });

		const collection = await getBlockCollectionByName('site-footer');
		const [instance] = await getBlockInstances(collection!.id);
		const key = `blocks.hero.${instance.id}.title`;

		expect(await getExistingTranslationKeys([key])).toEqual([key]);
	});

	it('leaves a plain collection empty', async () => {
		await post({ name: 'homepage-hero', schema: 'hero' });

		const collection = await getBlockCollectionByName('homepage-hero');
		expect(await getBlockInstances(collection!.id)).toEqual([]);
	});
});

describe('publishability', () => {
	it('opens a draft version so the change can be published', async () => {
		// Seeded through the data layer, which does not open a draft of its own.
		await createBlockSchema('hero');
		expect(await getLatestVersion('draft')).toBeNull();

		await post({ name: 'homepage-hero', schema: 'hero' });

		expect(await getLatestVersion('draft')).not.toBeNull();
	});
});

describe('re-applying a collection', () => {
	beforeEach(async () => {
		await seedSchema({ name: 'hero' });
		await seedSchema({ name: 'card' });
	});

	it('is a no-op when it already exists on the same schema', async () => {
		await post({ name: 'homepage-hero', schema: 'hero', singleton: true });

		const response = await post({
			name: 'homepage-hero',
			schema: 'hero',
			singleton: true,
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			created: false,
			instanceCount: 1,
		});

		const collection = await getBlockCollectionByName('homepage-hero');
		expect(await getBlockInstances(collection!.id)).toHaveLength(1);
		expect(await getBlockCollections()).toHaveLength(1);
	});

	it('moves an existing collection to the declared section', async () => {
		await post({ name: 'homepage-hero', schema: 'hero' });

		const response = await post({
			name: 'homepage-hero',
			schema: 'hero',
			section: 'home',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			created: false,
			updated: true,
			section: 'home',
		});
		expect(await getBlockCollectionByName('homepage-hero')).toMatchObject({
			section: 'home',
		});
	});

	it('leaves the section alone when the document does not declare one', async () => {
		await post({ name: 'homepage-hero', schema: 'hero', section: 'home' });

		const response = await post({ name: 'homepage-hero', schema: 'hero' });

		await expect(response.json()).resolves.toMatchObject({
			updated: false,
			section: 'home',
		});
	});

	it('refuses to rebind an existing collection to another schema', async () => {
		await post({ name: 'homepage-hero', schema: 'hero' });

		const response = await post({ name: 'homepage-hero', schema: 'card' });

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'COLLECTION_CONFLICT',
		});
		expect(await getBlockCollectionByName('homepage-hero')).toMatchObject({
			schemaName: 'hero',
		});
	});
});

describe('rejected documents', () => {
	it('404s for a schema that does not exist', async () => {
		const response = await post({ name: 'homepage-hero', schema: 'hero' });

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'SCHEMA_NOT_FOUND',
		});
		expect(await getBlockCollections()).toEqual([]);
	});

	it('rejects a collection name that is not kebab-case', async () => {
		await seedSchema({ name: 'hero' });

		const response = await post({ name: 'Homepage Hero', schema: 'hero' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_NAME',
		});
		expect(await getBlockCollections()).toEqual([]);
	});
});

describe('listing collections', () => {
	it('returns collections with their schema and instance count', async () => {
		await seedSchema({ name: 'hero' });
		await post({ name: 'homepage-hero', schema: 'hero', singleton: true });
		await post({ name: 'features', schema: 'hero', section: 'home' });

		const response = await loader({
			request: apiRequest('/edge-cms/api/blocks/collections', apiKey),
		} as never);

		await expect(response.json()).resolves.toEqual({
			collections: [
				{
					name: 'features',
					schema: 'hero',
					section: 'home',
					singleton: false,
					instanceCount: 0,
				},
				{
					name: 'homepage-hero',
					schema: 'hero',
					section: 'homepage-hero',
					singleton: true,
					instanceCount: 1,
				},
			],
		});
	});
});

describe('authentication', () => {
	it('rejects writes without an API key', async () => {
		const request = new Request(
			'https://cms.test/edge-cms/api/blocks/collections',
			{
				method: 'POST',
				body: JSON.stringify({ name: 'homepage-hero', schema: 'hero' }),
			},
		);

		await expect(action({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
		expect(await getBlockCollections()).toEqual([]);
	});

	it('rejects unsupported methods', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/blocks/collections', apiKey, {
				method: 'DELETE',
				body: JSON.stringify({ name: 'homepage-hero', schema: 'hero' }),
			}),
		} as never);

		expect(response.status).toBe(405);
	});
});
