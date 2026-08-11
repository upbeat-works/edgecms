import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/api/blocks.import';
import {
	createBlockCollection,
	createBlockSchema,
	createBlockSchemaProperty,
	getBlockInstances,
	getBlockInstanceValues,
} from '~/utils/db/blocks.server';
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
	await seedLanguage('en', true);
});

async function fixture() {
	const schema = await createBlockSchema('hero');
	await createBlockSchemaProperty({
		schemaId: schema.id,
		name: 'image',
		type: 'media',
	});
	return createBlockCollection({ name: 'heroes', schemaId: schema.id });
}

function post(items: Record<string, unknown>[]) {
	return action({
		request: apiRequest('/edge-cms/api/blocks/import', apiKey, {
			method: 'POST',
			body: JSON.stringify({ collection: 'heroes', locale: 'en', items }),
		}),
	} as never);
}

describe('importing block media', () => {
	it('accepts media IDs and reports the draft state', async () => {
		const collection = await fixture();
		const media = await seedMedia('hero.png');
		const response = await post([{ image: media.id }]);

		await expect(response.json()).resolves.toMatchObject({
			instancesCreated: 1,
			state: 'draft',
			draftVersionId: expect.any(Number),
		});
		const [instance] = await getBlockInstances(collection.id);
		expect(await getBlockInstanceValues(instance.id)).toMatchObject([
			{ mediaId: media.id },
		]);
	});

	it('rejects an unknown media ID without creating an instance', async () => {
		const collection = await fixture();
		const response = await post([{ image: 999 }]);

		expect(response.status).toBe(400);
		expect(await getBlockInstances(collection.id)).toEqual([]);
	});
});
