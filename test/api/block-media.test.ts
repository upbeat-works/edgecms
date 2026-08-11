import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/api/blocks.media';
import { action as replaceMedia } from '~/routes/edge-cms/api/media.$id';
import {
	createBlockCollection,
	createBlockInstance,
	createBlockSchema,
	createBlockSchemaProperty,
	getBlockInstanceValues,
	getBlockCollectionData,
} from '~/utils/db/blocks.server';
import { getLatestVersion } from '~/utils/db/versions.server';
import { apiRequest, createApiKey, resetDb, seedMedia } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

async function fixture() {
	const schema = await createBlockSchema('hero');
	const image = await createBlockSchemaProperty({
		schemaId: schema.id,
		name: 'image',
		type: 'media',
	});
	const collection = await createBlockCollection({
		name: 'heroes',
		schemaId: schema.id,
	});
	const instance = await createBlockInstance({
		schemaId: schema.id,
		collectionId: collection.id,
	});
	return { image, collection, instance };
}

function patch(
	collection: string,
	instanceId: number,
	property: string,
	mediaId: number | null,
) {
	return action({
		request: apiRequest('/edge-cms/api/blocks/media', apiKey, {
			method: 'PATCH',
			body: JSON.stringify({ mediaId }),
		}),
		params: { collection, instanceId: String(instanceId), property },
	} as never);
}

describe('attaching media to a block', () => {
	it('stores the media ID in a draft and can clear it', async () => {
		const { image, collection, instance } = await fixture();
		const media = await seedMedia('hero.png');
		const response = await patch(
			collection.name,
			instance.id,
			image.name,
			media.id,
		);

		await expect(response.json()).resolves.toMatchObject({
			mediaId: media.id,
			state: 'draft',
			draftVersionId: expect.any(Number),
		});
		expect(await getBlockInstanceValues(instance.id)).toMatchObject([
			{ mediaId: media.id },
		]);

		await patch(collection.name, instance.id, image.name, null);
		expect(await getBlockInstanceValues(instance.id)).toMatchObject([
			{ mediaId: null },
		]);
	});

	it('validates before opening a draft', async () => {
		const { collection, instance } = await fixture();
		const response = await patch(collection.name, instance.id, 'missing', 999);

		expect(response.status).toBe(404);
		expect(await getLatestVersion('draft')).toBeNull();
	});

	it('keeps an existing block reference usable after replacement', async () => {
		const { image, collection, instance } = await fixture();
		const media = await seedMedia('hero.png');
		await patch(collection.name, instance.id, image.name, media.id);
		const form = new FormData();
		form.set(
			'file',
			new File(['new'], 'replacement.png', { type: 'image/png' }),
		);
		await replaceMedia({
			request: new Request(`https://cms.test/edge-cms/api/media/${media.id}`, {
				method: 'PUT',
				body: form,
				headers: { 'x-api-key': apiKey },
			}),
			params: { id: String(media.id) },
		} as never);

		const data = await getBlockCollectionData(collection.name);
		expect(data?.items).toMatchObject([
			{ image: '/edge-cms/public/media/hero.png' },
		]);
	});
});
