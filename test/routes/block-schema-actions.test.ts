import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/blocks/blocks.schemas.new';
import { getBlockSchemaByName } from '~/utils/db.server';
import { authedRequest, resetDb, signIn } from '../helpers';

let cookie: string;

beforeEach(async () => {
	await resetDb();
	cookie = await signIn();
});

describe('creating a block schema', () => {
	it('returns the created schema so the drawer can open it', async () => {
		const body = new FormData();
		body.set('name', 'Feature Grid');

		const response = await action({
			request: authedRequest('/edge-cms/blocks/schemas/new', cookie, {
				method: 'POST',
				body,
			}),
		} as never);

		expect(response).toMatchObject({ schemaId: expect.any(Number) });
		if (!('schemaId' in response)) throw new Error('Schema creation failed');
		await expect(getBlockSchemaByName('feature-grid')).resolves.toMatchObject({
			id: response.schemaId,
		});
	});
});
