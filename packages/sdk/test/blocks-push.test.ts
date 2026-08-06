import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushBlocks } from '../src/commands/blocks.js';
import { fakeCMS, projectDir } from './helpers.js';

let cms: ReturnType<typeof fakeCMS>;

beforeEach(() => {
	cms = fakeCMS();
	cms.install();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	cms.close();
	vi.restoreAllMocks();
});

async function push(document: unknown) {
	const { config, path } = await projectDir({
		'blocks.schema.json': document,
	});
	await pushBlocks(config, { file: path('blocks.schema.json') });
	return config;
}

describe('applying a blocks document', () => {
	it('creates the declared schemas, properties and collections', async () => {
		await push({
			schemas: {
				hero: {
					title: 'translation',
					image: { type: 'media', description: 'Background' },
				},
			},
			collections: {
				'homepage-hero': { schema: 'hero', singleton: true },
			},
		});

		expect(cms.propertyNames('hero')).toEqual(['title', 'image']);
		expect(cms.collections.get('homepage-hero')).toMatchObject({
			schema: 'hero',
			singleton: true,
		});
	});

	// The schema a reference points at is usually the one with no references of
	// its own, and nothing says it has to be written first.
	it('applies references to a schema declared later in the file', async () => {
		await push({
			schemas: {
				hero: {
					title: 'translation',
					cards: { type: 'collection', refSchema: 'card' },
				},
				card: { heading: 'translation' },
			},
		});

		expect(cms.propertyNames('hero')).toEqual(['title', 'cards']);
		expect(cms.propertyNames('card')).toEqual(['heading']);
	});

	it('applies a schema that references itself', async () => {
		await push({
			schemas: {
				'menu-item': {
					label: 'translation',
					children: { type: 'collection', refSchema: 'menu-item' },
				},
			},
		});

		expect(cms.propertyNames('menu-item')).toEqual(['label', 'children']);
	});

	it('adds only what is missing when re-applied', async () => {
		const { config, path } = await projectDir({
			'blocks.schema.json': {
				schemas: {
					hero: {
						title: 'translation',
						cards: { type: 'collection', refSchema: 'card' },
					},
					card: { heading: 'translation' },
				},
				collections: { 'homepage-hero': { schema: 'hero' } },
			},
		});
		const file = path('blocks.schema.json');

		await pushBlocks(config, { file });
		const afterFirst = cms.propertyNames('hero');

		await pushBlocks(config, { file });

		expect(cms.propertyNames('hero')).toEqual(afterFirst);
		expect(cms.schemas.size).toBe(2);
		expect(cms.collections.size).toBe(1);
	});

	it('reports a property with no type rather than pushing a partial schema', async () => {
		await expect(
			push({ schemas: { hero: { title: { description: 'no type' } } } }),
		).rejects.toThrow(/has no "type"/);

		expect(cms.schemas.size).toBe(0);
	});

	it('reports a document it cannot read', async () => {
		const { config, path } = await projectDir({
			'blocks.schema.json': 'not json at all',
		});

		await expect(
			pushBlocks(config, { file: path('blocks.schema.json') }),
		).rejects.toThrow(/Failed to read/);
	});
});
