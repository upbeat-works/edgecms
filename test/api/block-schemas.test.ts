import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/blocks.schemas';
import {
	getBlockSchemaByName,
	getBlockSchemaProperties,
	getBlockSchemas,
} from '~/utils/db/blocks.server';
import { getLatestVersion } from '~/utils/db/versions.server';
import { apiRequest, createApiKey, resetDb } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

function post(body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/blocks/schemas', apiKey, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	} as never);
}

async function propertyNames(schemaName: string) {
	const schema = await getBlockSchemaByName(schemaName);
	if (!schema) return [];
	const properties = await getBlockSchemaProperties(schema.id);
	return properties.map(p => p.name);
}

describe('creating a schema', () => {
	it('creates the schema with its properties in the declared order', async () => {
		const response = await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'translation' },
				{ name: 'image', type: 'media', description: 'Background' },
				{ name: 'ctaUrl', type: 'string' },
			],
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			name: 'hero',
			created: true,
			propertiesAdded: 3,
			propertiesUpdated: 0,
			properties: [
				{
					name: 'title',
					type: 'translation',
					refSchema: null,
					description: null,
				},
				{
					name: 'image',
					type: 'media',
					refSchema: null,
					description: 'Background',
				},
				{ name: 'ctaUrl', type: 'string', refSchema: null, description: null },
			],
		});
		expect(await propertyNames('hero')).toEqual(['title', 'image', 'ctaUrl']);
	});

	it('creates a schema with no properties yet', async () => {
		const response = await post({ name: 'hero' });

		expect(response.status).toBe(201);
		expect(await getBlockSchemaByName('hero')).not.toBeNull();
		expect(await propertyNames('hero')).toEqual([]);
	});

	it('resolves a block property against the referenced schema', async () => {
		await post({
			name: 'card',
			properties: [{ name: 'title', type: 'string' }],
		});

		const response = await post({
			name: 'grid',
			properties: [{ name: 'cards', type: 'collection', refSchema: 'card' }],
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			properties: [
				{
					name: 'cards',
					type: 'collection',
					refSchema: 'card',
					description: null,
				},
			],
		});

		const card = await getBlockSchemaByName('card');
		const grid = await getBlockSchemaByName('grid');
		const properties = await getBlockSchemaProperties(grid!.id);
		expect(properties[0].refSchemaId).toBe(card!.id);
	});

	it('opens a draft version so the change can be published', async () => {
		expect(await getLatestVersion('draft')).toBeNull();

		await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'string' }],
		});

		expect(await getLatestVersion('draft')).not.toBeNull();
	});

	// A self-reference resolves to a row that does not exist until the schema
	// itself is created, so it is the one path that fills in refSchemaId after
	// the fact.
	it('creates a schema that references itself', async () => {
		const response = await post({
			name: 'menu-item',
			properties: [
				{ name: 'label', type: 'translation' },
				{ name: 'children', type: 'collection', refSchema: 'menu-item' },
			],
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			properties: [
				{ name: 'label' },
				{ name: 'children', refSchema: 'menu-item' },
			],
		});

		const schema = await getBlockSchemaByName('menu-item');
		const properties = await getBlockSchemaProperties(schema!.id);
		expect(properties[1].refSchemaId).toBe(schema!.id);
	});

	it('re-applies a self-referencing schema without conflict', async () => {
		const document = {
			name: 'menu-item',
			properties: [
				{ name: 'children', type: 'collection', refSchema: 'menu-item' },
			],
		};
		await post(document);

		const response = await post(document);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			created: false,
			propertiesAdded: 0,
		});
		expect(await propertyNames('menu-item')).toEqual(['children']);
	});
});

describe('re-applying a schema', () => {
	it('is a no-op when nothing changed', async () => {
		const document = {
			name: 'hero',
			properties: [
				{ name: 'title', type: 'translation' },
				{ name: 'ctaUrl', type: 'string' },
			],
		};
		await post(document);

		const response = await post(document);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			created: false,
			propertiesAdded: 0,
		});
		expect(await propertyNames('hero')).toEqual(['title', 'ctaUrl']);
		expect(await getBlockSchemas()).toHaveLength(1);
	});

	it('adds newly declared properties to an existing schema', async () => {
		await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'string' }],
		});

		const response = await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string' },
				{ name: 'subtitle', type: 'translation' },
			],
		});

		await expect(response.json()).resolves.toMatchObject({
			created: false,
			propertiesAdded: 1,
		});
		expect(await propertyNames('hero')).toEqual(['title', 'subtitle']);
	});

	// A description carries no structure, so applying it cannot orphan content
	// the way a retype would — and a document whose descriptions are silently
	// ignored stops describing the CMS.
	it('brings an existing description in line with the document', async () => {
		await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'string' }],
		});

		const response = await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string', description: 'Above the fold' },
			],
		});

		await expect(response.json()).resolves.toMatchObject({
			propertiesAdded: 0,
			propertiesUpdated: 1,
		});

		const schema = await getBlockSchemaByName('hero');
		const [title] = await getBlockSchemaProperties(schema!.id);
		expect(title.description).toBe('Above the fold');
	});

	it('keeps a description the document says nothing about', async () => {
		await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string', description: 'Written in the CMS' },
			],
		});

		const response = await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'string' }],
		});

		await expect(response.json()).resolves.toMatchObject({
			propertiesUpdated: 0,
		});

		const schema = await getBlockSchemaByName('hero');
		const [title] = await getBlockSchemaProperties(schema!.id);
		expect(title.description).toBe('Written in the CMS');
	});

	it('leaves properties that are no longer declared in place', async () => {
		await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string' },
				{ name: 'legacy', type: 'string' },
			],
		});

		await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'string' }],
		});

		expect(await propertyNames('hero')).toEqual(['title', 'legacy']);
	});

	it('refuses to retype an existing property, changing nothing', async () => {
		await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string' },
				{ name: 'ctaUrl', type: 'string' },
			],
		});

		const response = await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'number' },
				{ name: 'subtitle', type: 'string' },
			],
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'PROPERTY_CONFLICT',
		});

		const schema = await getBlockSchemaByName('hero');
		const properties = await getBlockSchemaProperties(schema!.id);
		expect(properties.map(p => [p.name, p.type])).toEqual([
			['title', 'string'],
			['ctaUrl', 'string'],
		]);
	});
});

describe('rejected documents', () => {
	it('rejects an unknown property type', async () => {
		const response = await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'richtext' }],
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'VALIDATION_ERROR',
		});
		expect(await getBlockSchemaByName('hero')).toBeNull();
	});

	it('rejects a reference to a schema that does not exist', async () => {
		const response = await post({
			name: 'grid',
			properties: [{ name: 'cards', type: 'block', refSchema: 'card' }],
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'REF_SCHEMA_NOT_FOUND',
		});
		expect(await getBlockSchemaByName('grid')).toBeNull();
	});

	it('rejects a block property with no reference at all', async () => {
		const response = await post({
			name: 'grid',
			properties: [{ name: 'cards', type: 'block' }],
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'MISSING_REF_SCHEMA',
		});
		expect(await getBlockSchemaByName('grid')).toBeNull();
	});

	it('rejects the same property declared twice', async () => {
		const response = await post({
			name: 'hero',
			properties: [
				{ name: 'title', type: 'string' },
				{ name: 'title', type: 'translation' },
			],
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'DUPLICATE_PROPERTY',
		});
		expect(await getBlockSchemaByName('hero')).toBeNull();
	});

	// Schema names travel into translation keys as
	// `blocks.<schema>.<instance>.<property>`, so a name carrying a dot or a
	// space would produce keys nothing can address.
	it('rejects a schema name that is not kebab-case', async () => {
		const response = await post({ name: 'Hero Section' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_NAME',
		});
		expect(await getBlockSchemas()).toEqual([]);
	});

	it('rejects a property name that is not camelCase', async () => {
		const response = await post({
			name: 'hero',
			properties: [{ name: 'cta url', type: 'string' }],
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_NAME',
		});
		expect(await getBlockSchemaByName('hero')).toBeNull();
	});
});

describe('listing schemas', () => {
	it('returns every schema with its properties', async () => {
		await post({
			name: 'hero',
			properties: [{ name: 'title', type: 'translation' }],
		});
		await post({ name: 'card' });

		const response = await loader({
			request: apiRequest('/edge-cms/api/blocks/schemas', apiKey),
		} as never);

		await expect(response.json()).resolves.toEqual({
			schemas: [
				{ name: 'card', properties: [] },
				{
					name: 'hero',
					properties: [
						{
							name: 'title',
							type: 'translation',
							refSchema: null,
							description: null,
						},
					],
				},
			],
		});
	});
});

describe('authentication', () => {
	it('rejects writes without an API key', async () => {
		const request = new Request(
			'https://cms.test/edge-cms/api/blocks/schemas',
			{
				method: 'POST',
				body: JSON.stringify({ name: 'hero' }),
			},
		);

		await expect(action({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
		expect(await getBlockSchemas()).toEqual([]);
	});

	it('rejects unsupported methods', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/blocks/schemas', apiKey, {
				method: 'DELETE',
				body: JSON.stringify({ name: 'hero' }),
			}),
		} as never);

		expect(response.status).toBe(405);
	});
});
