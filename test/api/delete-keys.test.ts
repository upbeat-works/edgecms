import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/api/i18n.keys';
import {
	createBlockCollection,
	createBlockInstance,
	createBlockSchema,
	createBlockSchemaProperty,
	upsertBlockInstanceValue,
} from '~/utils/db/blocks.server';
import {
	bulkUpsertTranslations,
	getExistingTranslationKeys,
	getTranslations,
	upsertTranslation,
} from '~/utils/db/translations.server';
import { getLatestVersion } from '~/utils/db/versions.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
	await seedLanguage('en', true);
	await seedLanguage('es');
});

function del(body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/i18n/keys', apiKey, {
			method: 'DELETE',
			body: JSON.stringify(body),
		}),
	} as never);
}

async function seedKey(key: string) {
	await upsertTranslation(key, 'en', `${key} in English`);
	await upsertTranslation(key, 'es', `${key} en español`);
}

/** A collection whose instance owns `blocks.<schema>.<id>.title`. */
async function seedBlockOwnedKey() {
	const schema = await createBlockSchema('hero');
	await createBlockSchemaProperty({
		schemaId: schema.id,
		name: 'title',
		type: 'translation',
	});
	const collection = await createBlockCollection({
		name: 'homepage-hero',
		schemaId: schema.id,
	});
	const instance = await createBlockInstance({
		schemaId: schema.id,
		collectionId: collection.id,
	});

	return `blocks.hero.${instance.id}.title`;
}

describe('dry run', () => {
	it('reports what would go without deleting anything', async () => {
		await seedKey('home.hero.title');
		await seedKey('home.hero.subtitle');

		const response = await del({
			keys: ['home.hero.title', 'home.hero.subtitle'],
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			dryRun: true,
			requested: 2,
			deleted: ['home.hero.title', 'home.hero.subtitle'],
			protected: [],
			missing: [],
		});
		expect(
			await getExistingTranslationKeys([
				'home.hero.title',
				'home.hero.subtitle',
			]),
		).toHaveLength(2);
	});

	it('is what a caller gets by default, without asking for it', async () => {
		await seedKey('home.hero.title');

		await del({ keys: ['home.hero.title'] });

		expect(await getExistingTranslationKeys(['home.hero.title'])).toEqual([
			'home.hero.title',
		]);
	});

	it('does not open a draft version', async () => {
		await seedKey('home.hero.title');

		await del({ keys: ['home.hero.title'] });

		expect(await getLatestVersion('draft')).toBeNull();
	});
});

describe('deleting for real', () => {
	it('removes the keys and every locale value for them', async () => {
		await seedKey('home.hero.title');
		await seedKey('home.hero.keepMe');

		const response = await del({
			keys: ['home.hero.title'],
			dryRun: false,
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			dryRun: false,
			deleted: ['home.hero.title'],
		});
		expect(await getExistingTranslationKeys(['home.hero.title'])).toEqual([]);
		expect(await getTranslations({ key: 'home.hero.title' })).toEqual([]);
		expect(await getExistingTranslationKeys(['home.hero.keepMe'])).toEqual([
			'home.hero.keepMe',
		]);
	});

	// More than the 90 keys that fit in one statement under D1's parameter cap,
	// so a dropped or mis-sliced chunk shows up as a key left behind.
	it('deletes more keys than fit in a single statement', async () => {
		const keys = Array.from({ length: 200 }, (_, i) => `bulk.key${i}`);
		await bulkUpsertTranslations(
			'en',
			Object.fromEntries(keys.map(key => [key, 'value'])),
		);

		const response = await del({ keys, dryRun: false });

		await expect(response.json()).resolves.toMatchObject({
			deleted: expect.arrayContaining(keys),
		});
		expect(await getExistingTranslationKeys(keys)).toEqual([]);
		expect(await getTranslations({ language: 'en' })).toEqual([]);
	});

	it('opens a draft version so the deletion can be published', async () => {
		await seedKey('home.hero.title');

		await del({ keys: ['home.hero.title'], dryRun: false });

		expect(await getLatestVersion('draft')).not.toBeNull();
	});
});

describe('keys a caller cannot delete', () => {
	it('never deletes a key owned by a block instance', async () => {
		const blockKey = await seedBlockOwnedKey();
		await seedKey('home.hero.title');

		const response = await del({
			keys: [blockKey, 'home.hero.title'],
			dryRun: false,
		});

		await expect(response.json()).resolves.toMatchObject({
			deleted: ['home.hero.title'],
			protected: [blockKey],
		});
		expect(await getExistingTranslationKeys([blockKey])).toEqual([blockKey]);
	});

	// An imported block can point a translation property at an author-written
	// key, which the key's own name gives no hint of.
	it('never deletes a key a block instance points at', async () => {
		const schema = await createBlockSchema('hero');
		const property = await createBlockSchemaProperty({
			schemaId: schema.id,
			name: 'title',
			type: 'translation',
		});
		const collection = await createBlockCollection({
			name: 'homepage-hero',
			schemaId: schema.id,
		});
		const instance = await createBlockInstance({
			schemaId: schema.id,
			collectionId: collection.id,
		});
		await seedKey('home.hero.title');
		await upsertBlockInstanceValue({
			instanceId: instance.id,
			propertyId: property.id,
			stringValue: 'home.hero.title',
		});

		const response = await del({
			keys: ['home.hero.title'],
			dryRun: false,
		});

		await expect(response.json()).resolves.toMatchObject({
			deleted: [],
			protected: ['home.hero.title'],
		});
		expect(await getExistingTranslationKeys(['home.hero.title'])).toEqual([
			'home.hero.title',
		]);
	});

	it('reports keys the CMS never had and deletes the rest', async () => {
		await seedKey('home.hero.title');

		const response = await del({
			keys: ['home.hero.title', 'typo.in.the.list'],
			dryRun: false,
		});

		await expect(response.json()).resolves.toMatchObject({
			requested: 2,
			deleted: ['home.hero.title'],
			missing: ['typo.in.the.list'],
		});
	});

	it('rejects an empty list rather than reporting a successful no-op', async () => {
		const response = await del({ keys: [] });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ code: 'NO_KEYS' });
	});
});

describe('authentication', () => {
	it('rejects deletion without an API key', async () => {
		await seedKey('home.hero.title');

		const request = new Request('https://cms.test/edge-cms/api/i18n/keys', {
			method: 'DELETE',
			body: JSON.stringify({ keys: ['home.hero.title'], dryRun: false }),
		});

		await expect(action({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
		expect(await getExistingTranslationKeys(['home.hero.title'])).toEqual([
			'home.hero.title',
		]);
	});

	it('rejects unsupported methods', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/i18n/keys', apiKey, {
				method: 'POST',
				body: JSON.stringify({ keys: ['home.hero.title'], dryRun: false }),
			}),
		} as never);

		expect(response.status).toBe(405);
	});
});
