import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/sections';
import {
	createBlockCollection,
	createBlockSchema,
	getBlockCollectionById,
} from '~/utils/db/blocks.server';
import { createMedia, getMedia } from '~/utils/db/media.server';
import { createSection, getSections } from '~/utils/db/sections.server';
import {
	getTranslations,
	upsertTranslation,
} from '~/utils/db/translations.server';
import {
	apiRequest,
	createApiKey,
	resetDb,
	seedLanguage,
	seedMedia,
} from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

function mutate(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/sections', apiKey, {
			method,
			body: JSON.stringify(body),
		}),
	});
}

describe('section management API', () => {
	it('creates and lists sections through the authenticated API', async () => {
		const created = await mutate('POST', { name: 'Homepage' });

		expect(created.status).toBe(201);
		await expect(created.json()).resolves.toEqual({ name: 'Homepage' });

		const response = await loader({
			request: apiRequest('/edge-cms/api/sections', apiKey),
		});
		await expect(response.json()).resolves.toEqual({
			sections: [{ name: 'Homepage' }],
		});
	});

	it('trims names and rejects empty or duplicate sections', async () => {
		await mutate('POST', { name: '  Homepage  ' });

		const duplicate = await mutate('POST', { name: 'Homepage' });
		expect(duplicate.status).toBe(409);
		await expect(duplicate.json()).resolves.toMatchObject({
			code: 'SECTION_EXISTS',
		});

		const empty = await mutate('POST', { name: '   ' });
		expect(empty.status).toBe(400);
		await expect(empty.json()).resolves.toMatchObject({
			code: 'INVALID_SECTION_NAME',
		});
		expect(await getSections()).toEqual([{ name: 'Homepage' }]);
	});

	it('renames a section and keeps existing content filed under it', async () => {
		await seedLanguage('en', true);
		await createSection('Homepage');
		await upsertTranslation('home.title', 'en', 'Hello', 'Homepage');

		const response = await mutate('PATCH', {
			name: 'Homepage',
			newName: 'Marketing',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ name: 'Marketing' });
		expect(await getSections()).toEqual([{ name: 'Marketing' }]);
		expect(await getTranslations({ key: 'home.title' })).toEqual([
			expect.objectContaining({ section: 'Marketing' }),
		]);
	});

	it('assigns existing i18n keys and media to an existing section', async () => {
		await seedLanguage('en', true);
		await createSection('Homepage');
		await upsertTranslation('home.title', 'en', 'Hello');
		await upsertTranslation('home.subtitle', 'en', 'Welcome');
		const hero = await seedMedia('hero.png');
		const logo = await seedMedia('logo.svg', '<svg/>', 'image/svg+xml');

		const response = await mutate('PUT', {
			name: 'Homepage',
			translationKeys: ['home.title', 'home.subtitle'],
			mediaIds: [hero.id, logo.id],
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			section: 'Homepage',
			translationKeysAssigned: 2,
			mediaAssigned: 2,
		});
		expect(await getTranslations({ section: 'Homepage' })).toHaveLength(2);
		expect(await getMedia({ section: 'Homepage' })).toHaveLength(2);
	});

	it('requires the target section to be created first', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Hello');

		const response = await mutate('PUT', {
			name: 'Homepage',
			translationKeys: ['home.title'],
		});

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'SECTION_NOT_FOUND',
			error: expect.stringContaining('sections:add'),
		});
		expect(await getSections()).toEqual([]);
		expect(await getTranslations({ key: 'home.title' })).toEqual([
			expect.objectContaining({ section: null }),
		]);
	});

	it('assigns nothing when any requested key or media ID is missing', async () => {
		await seedLanguage('en', true);
		await createSection('Homepage');
		await upsertTranslation('home.title', 'en', 'Hello');
		const hero = await seedMedia('hero.png');

		const response = await mutate('PUT', {
			name: 'Homepage',
			translationKeys: ['home.title', 'missing.key'],
			mediaIds: [hero.id, 999],
		});

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'SECTION_CONTENT_NOT_FOUND',
			error: expect.stringMatching(/missing\.key.*999/),
		});
		expect(await getTranslations({ key: 'home.title' })).toEqual([
			expect.objectContaining({ section: null }),
		]);
		expect(await getMedia()).toEqual([
			expect.objectContaining({ id: hero.id, section: null }),
		]);
	});

	it('reports deletion without unfiling content unless explicitly confirmed', async () => {
		await seedLanguage('en', true);
		await createSection('Homepage');
		await upsertTranslation('home.title', 'en', 'Hello', 'Homepage');
		await createMedia({
			filename: 'hero.png',
			mimeType: 'image/png',
			sizeBytes: 4,
			section: 'Homepage',
		});
		const schema = await createBlockSchema('hero');
		const collection = await createBlockCollection({
			name: 'heroes',
			schemaId: schema.id,
			section: 'Homepage',
		});

		const preview = await mutate('DELETE', { name: 'Homepage' });
		await expect(preview.json()).resolves.toEqual({
			name: 'Homepage',
			dryRun: true,
			deleted: false,
		});
		expect(await getSections()).toEqual([{ name: 'Homepage' }]);

		const deleted = await mutate('DELETE', {
			name: 'Homepage',
			dryRun: false,
		});
		await expect(deleted.json()).resolves.toEqual({
			name: 'Homepage',
			dryRun: false,
			deleted: true,
		});
		expect(await getSections()).toEqual([]);
		expect(await getTranslations({ key: 'home.title' })).toEqual([
			expect.objectContaining({ section: null }),
		]);
		expect(await getMedia()).toEqual([
			expect.objectContaining({ filename: 'hero.png', section: null }),
		]);
		expect(await getBlockCollectionById(collection.id)).toEqual(
			expect.objectContaining({ name: 'heroes', section: null }),
		);
	});

	it('reports a missing source section for rename and delete', async () => {
		for (const [method, body] of [
			['PATCH', { name: 'Missing', newName: 'Other' }],
			['DELETE', { name: 'Missing' }],
		] as const) {
			const response = await mutate(method, body);
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({
				code: 'SECTION_NOT_FOUND',
			});
		}
	});

	it('rejects writes without an API key', async () => {
		const request = new Request('https://cms.test/edge-cms/api/sections', {
			method: 'POST',
			body: JSON.stringify({ name: 'Homepage' }),
		});

		await expect(action({ request })).rejects.toMatchObject({ status: 401 });
		expect(await getSections()).toEqual([]);
	});
});
