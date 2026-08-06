import { beforeEach, describe, expect, it } from 'vitest';
import {
	createBlockCollection,
	createBlockSchema,
	getBlockCollectionByName,
	getBlockInstances,
} from '~/utils/db/blocks.server';
import { resetDb } from '../helpers';

let schemaId: number;

beforeEach(async () => {
	await resetDb();
	schemaId = (await createBlockSchema('hero-schema')).id;
});

/**
 * A singleton block owns exactly one instance, created up front. A collection
 * starts empty and gets instances added to it. The two must agree: whatever
 * `isCollection` ends up stored as should decide whether that instance exists.
 */
describe('creating a block collection', () => {
	it('starts a collection empty', async () => {
		const collection = await createBlockCollection({
			name: 'heroes',
			schemaId,
			isCollection: true,
		});

		expect(await getBlockInstances(collection.id)).toEqual([]);
	});

	it('gives a singleton its one instance up front', async () => {
		const collection = await createBlockCollection({
			name: 'homepage-hero',
			schemaId,
			isCollection: false,
		});

		expect(await getBlockInstances(collection.id)).toHaveLength(1);
	});

	it('defaults to a collection, and so starts empty', async () => {
		const collection = await createBlockCollection({
			name: 'heroes',
			schemaId,
		});

		const stored = await getBlockCollectionByName('heroes');
		expect(stored?.isCollection).toBe(true);
		expect(await getBlockInstances(collection.id)).toEqual([]);
	});
});
