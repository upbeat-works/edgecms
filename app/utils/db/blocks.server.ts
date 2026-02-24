import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import {
	blockSchemas,
	blockSchemaProperties,
	blockCollections,
	blockInstances,
	blockInstanceValues,
	sections,
	translationKeys,
} from '../schema.server';
import type {
	BlockSchema,
	BlockSchemaProperty,
	BlockCollection,
	BlockInstance,
	BlockInstanceValue,
} from '../blocks';
import { buildTranslationKey } from '../blocks';
import { updateTranslationKeySection } from './translations.server';
import { getMediaById } from './media.server';

const db = drizzle(env.DB);

// Block Schema operations
export async function getBlockSchemas(): Promise<BlockSchema[]> {
	const result = await db
		.select()
		.from(blockSchemas)
		.orderBy(blockSchemas.name);
	return result;
}

export async function getBlockSchemaById(
	id: number,
): Promise<BlockSchema | null> {
	const result = await db
		.select()
		.from(blockSchemas)
		.where(eq(blockSchemas.id, id));
	return result[0] || null;
}

export async function getBlockSchemaByName(
	name: string,
): Promise<BlockSchema | null> {
	const result = await db
		.select()
		.from(blockSchemas)
		.where(eq(blockSchemas.name, name));
	return result[0] || null;
}

export async function createBlockSchema(name: string): Promise<BlockSchema> {
	const result = await db.insert(blockSchemas).values({ name }).returning();
	return result[0];
}

export async function deleteBlockSchema(id: number): Promise<void> {
	// Check if any collections use this schema
	const collectionsUsingSchema = await db
		.select({ count: count() })
		.from(blockCollections)
		.where(eq(blockCollections.schemaId, id));

	if (collectionsUsingSchema[0]?.count > 0) {
		throw new Error(
			'Cannot delete schema: it is used by one or more collections',
		);
	}

	// Check if any properties reference this schema
	const propertiesRefSchema = await db
		.select({ count: count() })
		.from(blockSchemaProperties)
		.where(eq(blockSchemaProperties.refSchemaId, id));

	if (propertiesRefSchema[0]?.count > 0) {
		throw new Error(
			'Cannot delete schema: it is referenced by other schema properties',
		);
	}

	await db.delete(blockSchemas).where(eq(blockSchemas.id, id));
}

// Block Schema Property operations
export async function getBlockSchemaProperties(
	schemaId: number,
): Promise<BlockSchemaProperty[]> {
	const result = await db
		.select()
		.from(blockSchemaProperties)
		.where(eq(blockSchemaProperties.schemaId, schemaId))
		.orderBy(blockSchemaProperties.position);
	return result;
}

export async function createBlockSchemaProperty(props: {
	schemaId: number;
	name: string;
	type: 'string' | 'number' | 'translation' | 'media' | 'boolean' | 'block' | 'collection';
	refSchemaId?: number;
}): Promise<BlockSchemaProperty> {
	// Get max position for this schema
	const maxPos = await db
		.select({ max: sql<number>`MAX(position)` })
		.from(blockSchemaProperties)
		.where(eq(blockSchemaProperties.schemaId, props.schemaId));

	const position = (maxPos[0]?.max ?? -1) + 1;

	const result = await db
		.insert(blockSchemaProperties)
		.values({
			schemaId: props.schemaId,
			name: props.name,
			type: props.type,
			refSchemaId: props.refSchemaId || null,
			position,
		})
		.returning();
	return result[0];
}

export async function updateBlockSchemaProperty(
	id: number,
	props: { name?: string; type?: string; refSchemaId?: number | null },
): Promise<void> {
	const updates: Record<string, unknown> = {};
	if (props.name !== undefined) updates.name = props.name;
	if (props.type !== undefined) updates.type = props.type;
	if (props.refSchemaId !== undefined) updates.refSchemaId = props.refSchemaId;

	if (Object.keys(updates).length > 0) {
		await db
			.update(blockSchemaProperties)
			.set(updates)
			.where(eq(blockSchemaProperties.id, id));
	}
}

export async function deleteBlockSchemaProperty(id: number): Promise<void> {
	await db
		.delete(blockSchemaProperties)
		.where(eq(blockSchemaProperties.id, id));
}

export async function reorderBlockSchemaProperties(
	schemaId: number,
	propertyIds: number[],
): Promise<void> {
	for (let i = 0; i < propertyIds.length; i++) {
		await db
			.update(blockSchemaProperties)
			.set({ position: i })
			.where(
				and(
					eq(blockSchemaProperties.id, propertyIds[i]),
					eq(blockSchemaProperties.schemaId, schemaId),
				),
			);
	}
}

// Block Collection operations
export async function getBlockCollections(): Promise<
	(BlockCollection & { schemaName: string; instanceCount: number })[]
> {
	const result = await db
		.select({
			collection: blockCollections,
			schemaName: blockSchemas.name,
			instanceCount: sql<number>`(
				SELECT COUNT(*) FROM block_instances
				WHERE block_instances.collectionId = ${blockCollections.id}
			)`,
		})
		.from(blockCollections)
		.innerJoin(blockSchemas, eq(blockCollections.schemaId, blockSchemas.id))
		.orderBy(blockCollections.name);

	return result.map(row => ({
		...row.collection,
		schemaName: row.schemaName,
		instanceCount: row.instanceCount,
	}));
}

export async function getBlockCollectionById(
	id: number,
): Promise<(BlockCollection & { schemaName: string }) | null> {
	const result = await db
		.select({
			collection: blockCollections,
			schemaName: blockSchemas.name,
		})
		.from(blockCollections)
		.innerJoin(blockSchemas, eq(blockCollections.schemaId, blockSchemas.id))
		.where(eq(blockCollections.id, id));

	if (result.length === 0) return null;
	return { ...result[0].collection, schemaName: result[0].schemaName };
}

export async function getBlockCollectionByName(
	name: string,
): Promise<(BlockCollection & { schemaName: string }) | null> {
	const result = await db
		.select({
			collection: blockCollections,
			schemaName: blockSchemas.name,
		})
		.from(blockCollections)
		.innerJoin(blockSchemas, eq(blockCollections.schemaId, blockSchemas.id))
		.where(eq(blockCollections.name, name));

	if (result.length === 0) return null;
	return { ...result[0].collection, schemaName: result[0].schemaName };
}

export async function createBlockCollection(props: {
	name: string;
	schemaId: number;
	section?: string;
	isCollection?: boolean;
}): Promise<BlockCollection> {
	// Auto-create section if it doesn't exist
	const sectionName = props.section || props.name;
	const existingSection = await db
		.select()
		.from(sections)
		.where(eq(sections.name, sectionName));

	if (existingSection.length === 0) {
		await db.insert(sections).values({ name: sectionName });
	}

	const result = await db
		.insert(blockCollections)
		.values({
			name: props.name,
			schemaId: props.schemaId,
			section: sectionName,
			isCollection: props.isCollection ?? true,
		})
		.returning();

	// For singleton blocks, create the single instance immediately
	if (!props.isCollection) {
		await createBlockInstance({
			schemaId: props.schemaId,
			collectionId: result[0].id,
		});
	}

	return result[0];
}

export async function updateBlockCollectionSection(
	id: number,
	section: string | null,
): Promise<void> {
	// Get old collection to update translation keys
	const oldCollection = await getBlockCollectionById(id);
	if (!oldCollection) return;

	await db
		.update(blockCollections)
		.set({ section })
		.where(eq(blockCollections.id, id));

	// Update translation keys section for all instances in this collection
	const instances = await db
		.select()
		.from(blockInstances)
		.where(eq(blockInstances.collectionId, id));

	const schema = await getBlockSchemaById(oldCollection.schemaId);
	if (!schema) return;

	for (const instance of instances) {
		const properties = await getBlockSchemaProperties(instance.schemaId);
		for (const prop of properties) {
			if (prop.type === 'translation') {
				const key = buildTranslationKey(schema.name, instance.id, prop.name);
				await updateTranslationKeySection(key, section || undefined);
			}
		}
	}
}

export async function deleteBlockCollection(id: number): Promise<void> {
	// Get all instances in this collection to delete their translation keys
	const instances = await db
		.select()
		.from(blockInstances)
		.where(eq(blockInstances.collectionId, id));

	for (const instance of instances) {
		await deleteBlockInstanceTranslations(instance.id, instance.schemaId);
	}

	await db.delete(blockCollections).where(eq(blockCollections.id, id));
}

// Block Instance operations
export async function getBlockInstances(
	collectionId: number,
): Promise<BlockInstance[]> {
	const result = await db
		.select()
		.from(blockInstances)
		.where(eq(blockInstances.collectionId, collectionId))
		.orderBy(blockInstances.position);
	return result;
}

export async function getBlockInstanceById(
	id: number,
): Promise<BlockInstance | null> {
	const result = await db
		.select()
		.from(blockInstances)
		.where(eq(blockInstances.id, id));
	return result[0] || null;
}

export async function createBlockInstance(props: {
	schemaId: number;
	collectionId: number;
}): Promise<BlockInstance> {
	// Get max position in collection
	const maxPos = await db
		.select({ max: sql<number>`MAX(position)` })
		.from(blockInstances)
		.where(eq(blockInstances.collectionId, props.collectionId));

	const position = (maxPos[0]?.max ?? -1) + 1;

	const result = await db
		.insert(blockInstances)
		.values({
			schemaId: props.schemaId,
			collectionId: props.collectionId,
			position,
		})
		.returning();

	const instance = result[0];

	// Create translation keys for translation-type properties
	const properties = await getBlockSchemaProperties(props.schemaId);
	const schema = await getBlockSchemaById(props.schemaId);
	const collection = await getBlockCollectionById(props.collectionId);

	if (schema && collection) {
		for (const prop of properties) {
			if (prop.type === 'translation') {
				const key = buildTranslationKey(schema.name, instance.id, prop.name);
				// Create empty translation key with section
				await db
					.insert(translationKeys)
					.values({ key, section: collection.section })
					.onConflictDoNothing();
				// Store the translation key as stringValue so getBlockCollectionData can read it
				await upsertBlockInstanceValue({
					instanceId: instance.id,
					propertyId: prop.id,
					stringValue: key,
				});
			}
		}
	}

	return instance;
}

export async function deleteBlockInstance(id: number): Promise<void> {
	const instance = await getBlockInstanceById(id);
	if (!instance) return;

	// Delete translation keys
	await deleteBlockInstanceTranslations(id, instance.schemaId);

	await db.delete(blockInstances).where(eq(blockInstances.id, id));

	// Reorder remaining instances
	if (instance.collectionId) {
		const remaining = await db
			.select()
			.from(blockInstances)
			.where(eq(blockInstances.collectionId, instance.collectionId))
			.orderBy(blockInstances.position);

		for (let i = 0; i < remaining.length; i++) {
			await db
				.update(blockInstances)
				.set({ position: i })
				.where(eq(blockInstances.id, remaining[i].id));
		}
	}
}

export async function reorderBlockInstances(
	collectionId: number,
	instanceIds: number[],
): Promise<void> {
	for (let i = 0; i < instanceIds.length; i++) {
		await db
			.update(blockInstances)
			.set({ position: i })
			.where(
				and(
					eq(blockInstances.id, instanceIds[i]),
					eq(blockInstances.collectionId, collectionId),
				),
			);
	}
}

// Block Instance Value operations
export async function getBlockInstanceValues(
	instanceId: number,
): Promise<BlockInstanceValue[]> {
	const result = await db
		.select()
		.from(blockInstanceValues)
		.where(eq(blockInstanceValues.instanceId, instanceId));
	return result;
}

export async function upsertBlockInstanceValue(props: {
	instanceId: number;
	propertyId: number;
	stringValue?: string | null;
	numberValue?: number | null;
	booleanValue?: boolean;
	mediaId?: number | null;
}): Promise<void> {
	const stringValue = props.stringValue ?? null;
	const booleanValue = props.booleanValue !== undefined
		? (props.booleanValue ? 1 : 0)
		: null;
	const numberValue = props.numberValue ?? null;

	await db
		.insert(blockInstanceValues)
		.values({
			instanceId: props.instanceId,
			propertyId: props.propertyId,
			stringValue,
			booleanValue,
			numberValue,
			mediaId: props.mediaId ?? null,
		})
		.onConflictDoUpdate({
			target: [blockInstanceValues.instanceId, blockInstanceValues.propertyId],
			set: {
				stringValue,
				booleanValue,
				numberValue,
				mediaId: props.mediaId ?? null,
			},
		});
}

// Helper: Delete all translation keys for a block instance
async function deleteBlockInstanceTranslations(
	instanceId: number,
	schemaId: number,
): Promise<void> {
	const { deleteTranslationsByKeys } = await import('./translations.server');

	const schema = await getBlockSchemaById(schemaId);
	if (!schema) return;

	const properties = await getBlockSchemaProperties(schemaId);
	const keysToDelete: string[] = [];

	for (const prop of properties) {
		if (prop.type === 'translation') {
			keysToDelete.push(
				buildTranslationKey(schema.name, instanceId, prop.name),
			);
		}
	}

	if (keysToDelete.length > 0) {
		await deleteTranslationsByKeys(keysToDelete);
	}
}

// Get full block data for API response
export async function getBlockCollectionData(collectionName: string): Promise<{
	collection: string;
	schema: string;
	section: string | null;
	items: Record<string, unknown>[];
} | null> {
	const collection = await getBlockCollectionByName(collectionName);
	if (!collection) return null;

	const instances = await getBlockInstances(collection.id);
	const properties = await getBlockSchemaProperties(collection.schemaId);

	const items: Record<string, unknown>[] = [];

	for (const instance of instances) {
		const values = await getBlockInstanceValues(instance.id);
		const item: Record<string, unknown> = {
			id: instance.id,
			position: instance.position,
		};

		for (const prop of properties) {
			if (prop.type === 'string') {
				const value = values.find(v => v.propertyId === prop.id);
				item[prop.name] = value?.stringValue || null;
			} else if (prop.type === 'number') {
				const value = values.find(v => v.propertyId === prop.id);
				item[prop.name] = value?.numberValue ?? null;
			} else if (prop.type === 'translation') {
				const value = values.find(v => v.propertyId === prop.id);
				item[prop.name] = value?.stringValue ||
					buildTranslationKey(
						collection.schemaName,
						instance.id,
						prop.name,
					);
			} else if (prop.type === 'boolean') {
				const value = values.find(v => v.propertyId === prop.id);
				item[prop.name] = value?.booleanValue === 1;
			} else if (prop.type === 'media') {
				const value = values.find(v => v.propertyId === prop.id);
				if (value?.mediaId) {
					const mediaFile = await getMediaById(value.mediaId);
					if (mediaFile) {
						item[prop.name] = `/edge-cms/public/media/${mediaFile.filename}`;
					} else {
						item[prop.name] = null;
					}
				} else {
					item[prop.name] = null;
				}
			}
			// TODO: Handle nested block and collection types
		}

		items.push(item);
	}

	return {
		collection: collection.name,
		schema: collection.schemaName,
		section: collection.section,
		items,
	};
}

// Bulk import block items from JSON
export async function importBlockItems(
	collectionId: number,
	items: Record<string, unknown>[],
	locale: string,
): Promise<number> {
	const collection = await getBlockCollectionById(collectionId);
	if (!collection) throw new Error('Collection not found');

	const schema = await getBlockSchemaById(collection.schemaId);
	if (!schema) throw new Error('Schema not found');

	const properties = await getBlockSchemaProperties(collection.schemaId);

	let created = 0;

	for (const item of items) {
		const instance = await createBlockInstance({
			schemaId: collection.schemaId,
			collectionId,
		});

		for (const prop of properties) {
			if (!(prop.name in item)) continue;
			const value = item[prop.name];

			switch (prop.type) {
				case 'string':
					await upsertBlockInstanceValue({
						instanceId: instance.id,
						propertyId: prop.id,
						stringValue: String(value ?? ''),
					});
					break;
				case 'translation':
					// Store the provided translation key reference as a string value
					await upsertBlockInstanceValue({
						instanceId: instance.id,
						propertyId: prop.id,
						stringValue: String(value ?? ''),
					});
					break;
				case 'number': {
					const num = Number(value);
					if (value != null && value !== '' && !isNaN(num)) {
						await upsertBlockInstanceValue({
							instanceId: instance.id,
							propertyId: prop.id,
							numberValue: num,
						});
					}
					break;
				}
				case 'boolean':
					await upsertBlockInstanceValue({
						instanceId: instance.id,
						propertyId: prop.id,
						booleanValue: Boolean(value),
					});
					break;
				// media — skip
			}
		}

		created++;
	}

	return created;
}

// Re-export buildTranslationKey for convenience
export { buildTranslationKey };
