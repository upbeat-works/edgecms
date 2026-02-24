import {
	getBlockInstanceValues,
	getTranslations,
	getMediaById,
	type BlockSchemaProperty,
	type BlockSchema,
	type BlockInstance,
} from '~/utils/db.server';
import { buildTranslationKey } from '~/utils/blocks';

/**
 * Shape of enriched instance values with media info
 */
export type EnrichedInstanceValue = {
	stringValue: string | null;
	booleanValue: number | null;
	numberValue: number | null;
	mediaId: number | null;
	media: {
		id: number;
		filename: string;
		mimeType: string;
		version: number;
	} | null;
};

/**
 * Shape of instance with enriched values and translations
 */
export type EnrichedInstance = BlockInstance & {
	values: Record<number, EnrichedInstanceValue>;
	translations: Record<string, Record<string, string>>;
};

/**
 * Builds a map of property values for an instance, enriched with media info
 */
export async function buildInstanceValuesMap(
	instanceId: number,
): Promise<Record<number, EnrichedInstanceValue>> {
	const values = await getBlockInstanceValues(instanceId);
	const valuesMap: Record<number, EnrichedInstanceValue> = {};

	await Promise.all(
		values.map(async v => {
			let media = null;
			if (v.mediaId) {
				const mediaFile = await getMediaById(v.mediaId);
				if (mediaFile) {
					media = {
						id: mediaFile.id,
						filename: mediaFile.filename,
						mimeType: mediaFile.mimeType,
						version: mediaFile.version,
					};
				}
			}
			valuesMap[v.propertyId] = {
				stringValue: v.stringValue,
				booleanValue: v.booleanValue,
				numberValue: v.numberValue,
				mediaId: v.mediaId,
				media,
			};
		}),
	);

	return valuesMap;
}

/**
 * Builds a map of translations for an instance's translation-type properties
 */
export async function buildInstanceTranslations(
	instance: BlockInstance,
	properties: BlockSchemaProperty[],
	schema: BlockSchema,
	valuesMap: Record<number, EnrichedInstanceValue>,
): Promise<Record<string, Record<string, string>>> {
	const translations: Record<string, Record<string, string>> = {};

	for (const prop of properties) {
		if (prop.type === 'translation') {
			// Use stored key (supports custom keys from import), fall back to auto-generated
			const key = valuesMap[prop.id]?.stringValue ||
				buildTranslationKey(schema.name, instance.id, prop.name);
			const trans = await getTranslations({ key });
			translations[prop.name] = {};
			trans.forEach(t => {
				translations[prop.name][t.language] = t.value;
			});
		}
	}

	return translations;
}

/**
 * Enriches a single instance with values and translations
 */
export async function enrichInstance(
	instance: BlockInstance,
	properties: BlockSchemaProperty[],
	schema: BlockSchema | null,
): Promise<EnrichedInstance> {
	const values = await buildInstanceValuesMap(instance.id);
	const translations = schema
		? await buildInstanceTranslations(instance, properties, schema, values)
		: {};

	return {
		...instance,
		values,
		translations,
	};
}

/**
 * Enriches multiple instances with values and translations
 */
export async function enrichInstances(
	instances: BlockInstance[],
	properties: BlockSchemaProperty[],
	schema: BlockSchema | null,
): Promise<EnrichedInstance[]> {
	return Promise.all(
		instances.map(instance => enrichInstance(instance, properties, schema)),
	);
}
