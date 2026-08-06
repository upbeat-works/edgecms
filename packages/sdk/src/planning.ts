import type { BlockProperty, BlockPropertyType } from './api.js';

export const REFERENCE_TYPES: BlockPropertyType[] = ['block', 'collection'];

/**
 * The declarative blocks document, e.g.
 *
 * {
 *   "schemas": {
 *     "hero": {
 *       "title": "translation",
 *       "image": { "type": "media", "description": "Background" },
 *       "cards": { "type": "collection", "refSchema": "card" }
 *     }
 *   },
 *   "collections": {
 *     "homepage-hero": { "schema": "hero", "singleton": true }
 *   }
 * }
 */
export interface BlocksDocument {
	schemas?: Record<
		string,
		Record<
			string,
			| BlockPropertyType
			| { type: BlockPropertyType; refSchema?: string; description?: string }
		>
	>;
	collections?: Record<
		string,
		{ schema: string; section?: string; singleton?: boolean }
	>;
}

export interface SchemaDeclaration {
	name: string;
	properties: BlockProperty[];
}

export interface CollectionDeclaration {
	name: string;
	schema: string;
	section?: string;
	singleton?: boolean;
}

function parseProperties(
	schemaName: string,
	declared: NonNullable<BlocksDocument['schemas']>[string],
): BlockProperty[] {
	return Object.entries(declared ?? {}).map(([name, value]) => {
		const property = typeof value === 'string' ? { type: value } : value;

		if (property == null || typeof property !== 'object' || !property.type) {
			throw new Error(
				`Property "${name}" on schema "${schemaName}" has no "type"`,
			);
		}

		return { name, ...property };
	});
}

/**
 * Read a blocks document into the declarations to apply, keeping the order
 * properties were written in.
 */
export function parseBlocksDocument(document: BlocksDocument): {
	schemas: SchemaDeclaration[];
	collections: CollectionDeclaration[];
} {
	if (document == null || typeof document !== 'object') {
		throw new Error('The blocks document must be a JSON object');
	}

	return {
		schemas: Object.entries(document.schemas ?? {}).map(([name, declared]) => ({
			name,
			properties: parseProperties(name, declared),
		})),
		collections: Object.entries(document.collections ?? {}).map(
			([name, declared]) => ({ name, ...declared }),
		),
	};
}

export function hasReference(schema: SchemaDeclaration): boolean {
	return schema.properties.some(p => REFERENCE_TYPES.includes(p.type));
}

/**
 * A property can point at a schema declared anywhere in the file — or at its
 * own schema — and the CMS can only resolve a reference to a schema that
 * already exists. So when anything references anything, every schema is created
 * first without its reference properties, and the second pass adds them.
 *
 * The prepass covers *every* schema, not just the referencing ones: the schema
 * a reference points at is usually the one with no references of its own.
 */
export function planSchemaApplication(schemas: SchemaDeclaration[]): {
	prepass: SchemaDeclaration[];
	apply: SchemaDeclaration[];
} {
	if (!schemas.some(hasReference)) {
		return { prepass: [], apply: schemas };
	}

	return {
		prepass: schemas.map(schema => ({
			name: schema.name,
			properties: schema.properties.filter(
				p => !REFERENCE_TYPES.includes(p.type),
			),
		})),
		apply: schemas,
	};
}

/**
 * The keys the CMS holds that the local translations no longer mention.
 */
export function computeOrphanKeys(
	localKeys: Iterable<string>,
	remoteKeys: string[],
): string[] {
	const local = new Set(localKeys);
	return remoteKeys.filter(key => !local.has(key));
}
