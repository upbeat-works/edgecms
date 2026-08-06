import {
	createBlockCollection as createBlockCollectionRow,
	createBlockSchema,
	createBlockSchemaProperty,
	getBlockCollectionByName,
	getBlockCollections,
	getBlockInstances,
	getBlockSchemaByName,
	getBlockSchemaProperties,
	getBlockSchemas,
	updateBlockCollectionSection,
	updateBlockSchemaProperty,
} from '../db/blocks.server';
import { ensureDraftVersion } from '../ensure-draft-version.server';
import { err, ok, type ServiceResult } from './result';

export type BlockPropertyType =
	| 'string'
	| 'number'
	| 'translation'
	| 'media'
	| 'boolean'
	| 'block'
	| 'collection';

export interface BlockPropertyInput {
	name: string;
	type: BlockPropertyType;
	refSchema?: string;
	description?: string;
}

export interface BlockPropertyResult {
	name: string;
	type: BlockPropertyType;
	refSchema: string | null;
	description: string | null;
}

export interface BlockSchemaResult {
	name: string;
	created: boolean;
	propertiesAdded: number;
	/** Existing properties whose declared description was applied. */
	propertiesUpdated: number;
	properties: BlockPropertyResult[];
}

export interface BlockCollectionResult {
	name: string;
	schema: string;
	section: string | null;
	singleton: boolean;
	created: boolean;
	/** An existing collection was moved to the declared section. */
	updated: boolean;
	instanceCount: number;
}

/**
 * Schema and collection names reach the outside world verbatim — schema names
 * become part of `blocks.<schema>.<instance>.<property>` translation keys, and
 * collection names become public URLs. The UI slugifies what an author types;
 * the API refuses instead, so a declarative document keeps meaning what it says.
 */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

const REFERENCE_TYPES: BlockPropertyType[] = ['block', 'collection'];

function describeProperty(
	property: {
		name: string;
		type: string;
		refSchemaId: number | null;
		description: string | null;
	},
	schemaNamesById: Map<number, string>,
): BlockPropertyResult {
	return {
		name: property.name,
		type: property.type as BlockPropertyType,
		refSchema:
			property.refSchemaId == null
				? null
				: (schemaNamesById.get(property.refSchemaId) ?? null),
		description: property.description,
	};
}

async function schemaNameLookup(): Promise<Map<number, string>> {
	const schemas = await getBlockSchemas();
	return new Map(schemas.map(schema => [schema.id, schema.name]));
}

export async function listBlockSchemas(): Promise<
	ServiceResult<{
		schemas: { name: string; properties: BlockPropertyResult[] }[];
	}>
> {
	const schemas = await getBlockSchemas();
	const namesById = new Map(schemas.map(schema => [schema.id, schema.name]));

	const described = [];
	for (const schema of schemas) {
		const properties = await getBlockSchemaProperties(schema.id);
		described.push({
			name: schema.name,
			properties: properties.map(property =>
				describeProperty(property, namesById),
			),
		});
	}

	return ok({ schemas: described });
}

/**
 * Create a schema, or add the properties it is missing. Additive only: a
 * property that already exists is never retyped or dropped, so applying the
 * same document twice is a no-op and applying a contradictory one fails loudly.
 */
export async function applyBlockSchema(
	name: string,
	properties: BlockPropertyInput[],
	options: { userId?: string } = {},
): Promise<ServiceResult<BlockSchemaResult>> {
	if (!KEBAB_CASE.test(name)) {
		return err(
			'INVALID_NAME',
			`"${name}" is not a valid schema name. Expected kebab-case, such as "hero-banner".`,
			400,
		);
	}

	const seen = new Set<string>();
	for (const property of properties) {
		if (!CAMEL_CASE.test(property.name)) {
			return err(
				'INVALID_NAME',
				`"${property.name}" is not a valid property name. Expected camelCase, such as "ctaUrl".`,
				400,
			);
		}
		if (seen.has(property.name)) {
			return err(
				'DUPLICATE_PROPERTY',
				`Property "${property.name}" is declared more than once on schema "${name}"`,
				400,
			);
		}
		seen.add(property.name);
	}

	const existingSchemas = await getBlockSchemas();
	const idsByName = new Map(
		existingSchemas.map(schema => [schema.name, schema.id]),
	);

	// A schema may reference itself, which only resolves once its row exists.
	const selfReferencing = new Set<string>();
	const refSchemaIds = new Map<string, number | null>();

	for (const property of properties) {
		if (!REFERENCE_TYPES.includes(property.type)) {
			refSchemaIds.set(property.name, null);
			continue;
		}
		if (!property.refSchema) {
			return err(
				'MISSING_REF_SCHEMA',
				`Property "${property.name}" is of type "${property.type}" and must name a refSchema`,
				400,
			);
		}
		if (property.refSchema === name) {
			selfReferencing.add(property.name);
			refSchemaIds.set(property.name, null);
			continue;
		}
		const refId = idsByName.get(property.refSchema);
		if (refId == null) {
			return err(
				'REF_SCHEMA_NOT_FOUND',
				`Property "${property.name}" references schema "${property.refSchema}", which does not exist`,
				400,
			);
		}
		refSchemaIds.set(property.name, refId);
	}

	let schema = await getBlockSchemaByName(name);
	const created = schema == null;
	const existingProperties = schema
		? await getBlockSchemaProperties(schema.id)
		: [];
	const existingByName = new Map(existingProperties.map(p => [p.name, p]));

	// Check every declared property against what is already stored before
	// writing anything, so a conflict halfway down the list leaves no trace.
	for (const property of properties) {
		const current = existingByName.get(property.name);
		if (!current) continue;

		const expectedRefId = selfReferencing.has(property.name)
			? schema!.id
			: (refSchemaIds.get(property.name) ?? null);

		if (
			current.type !== property.type ||
			current.refSchemaId !== expectedRefId
		) {
			return err(
				'PROPERTY_CONFLICT',
				`Property "${property.name}" already exists on schema "${name}" as type "${current.type}". Change it in the CMS, or declare it as it is.`,
				409,
			);
		}
	}

	const toAdd = properties.filter(p => !existingByName.has(p.name));

	// A description carries no structure, so unlike a type it can be brought in
	// line with the document without risk to stored content. Properties the
	// document doesn't mention keep whatever they have.
	const toDescribe = properties.filter(property => {
		const current = existingByName.get(property.name);
		return (
			current != null &&
			property.description !== undefined &&
			property.description !== (current.description ?? undefined)
		);
	});

	if (created || toAdd.length > 0 || toDescribe.length > 0) {
		await ensureDraftVersion(options.userId);
	}

	if (schema == null) {
		schema = await createBlockSchema(name);
	}

	for (const property of toAdd) {
		await createBlockSchemaProperty({
			schemaId: schema.id,
			name: property.name,
			type: property.type,
			refSchemaId: selfReferencing.has(property.name)
				? schema.id
				: (refSchemaIds.get(property.name) ?? undefined),
			description: property.description,
		});
	}

	for (const property of toDescribe) {
		await updateBlockSchemaProperty(existingByName.get(property.name)!.id, {
			description: property.description ?? null,
		});
	}

	const namesById = await schemaNameLookup();
	const stored = await getBlockSchemaProperties(schema.id);

	return ok({
		name: schema.name,
		created,
		propertiesAdded: toAdd.length,
		propertiesUpdated: toDescribe.length,
		properties: stored.map(property => describeProperty(property, namesById)),
	});
}

export async function listBlockCollections(): Promise<
	ServiceResult<{
		collections: Omit<BlockCollectionResult, 'created' | 'updated'>[];
	}>
> {
	const collections = await getBlockCollections();

	return ok({
		collections: collections.map(collection => ({
			name: collection.name,
			schema: collection.schemaName,
			section: collection.section,
			singleton: !collection.isCollection,
			instanceCount: collection.instanceCount,
		})),
	});
}

/**
 * Create a collection bound to a schema. Re-declaring one that already exists
 * unchanged succeeds without touching it; re-declaring it differently fails,
 * since rebinding a collection would orphan the content already under it.
 */
export async function createBlockCollection(
	input: {
		name: string;
		schema: string;
		section?: string;
		singleton?: boolean;
	},
	options: { userId?: string } = {},
): Promise<ServiceResult<BlockCollectionResult>> {
	if (!KEBAB_CASE.test(input.name)) {
		return err(
			'INVALID_NAME',
			`"${input.name}" is not a valid collection name. Expected kebab-case, such as "homepage-hero".`,
			400,
		);
	}

	const schema = await getBlockSchemaByName(input.schema);
	if (!schema) {
		return err(
			'SCHEMA_NOT_FOUND',
			`Schema "${input.schema}" does not exist. Create it first with POST /api/blocks/schemas.`,
			404,
		);
	}

	const existing = await getBlockCollectionByName(input.name);
	if (existing) {
		if (existing.schemaName !== input.schema) {
			return err(
				'COLLECTION_CONFLICT',
				`Collection "${input.name}" already exists on schema "${existing.schemaName}" and cannot be rebound to "${input.schema}"`,
				409,
			);
		}

		const singleton = !existing.isCollection;
		if (input.singleton !== undefined && input.singleton !== singleton) {
			return err(
				'COLLECTION_CONFLICT',
				`Collection "${input.name}" already exists as a ${singleton ? 'singleton' : 'collection'} and cannot be changed`,
				409,
			);
		}

		// Moving a collection between sections re-files its content without
		// changing it, so a declared section is applied rather than ignored.
		const movesSection =
			input.section !== undefined && input.section !== existing.section;
		if (movesSection) {
			await ensureDraftVersion(options.userId);
			await updateBlockCollectionSection(existing.id, input.section!);
		}

		const instances = await getBlockInstances(existing.id);

		return ok({
			name: existing.name,
			schema: existing.schemaName,
			section: movesSection ? input.section! : existing.section,
			singleton,
			created: false,
			updated: movesSection,
			instanceCount: instances.length,
		});
	}

	await ensureDraftVersion(options.userId);

	const singleton = input.singleton === true;
	const collection = await createBlockCollectionRow({
		name: input.name,
		schemaId: schema.id,
		section: input.section,
		isCollection: !singleton,
	});
	const instances = await getBlockInstances(collection.id);

	return ok({
		name: collection.name,
		schema: schema.name,
		section: collection.section,
		singleton,
		created: true,
		updated: false,
		instanceCount: instances.length,
	});
}
