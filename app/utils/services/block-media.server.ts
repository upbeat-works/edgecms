import {
	getBlockCollectionByName,
	getBlockInstanceById,
	getBlockSchemaProperties,
	getLatestVersion,
	getMediaById,
	upsertBlockInstanceValue,
} from '../db/index.server';
import { ensureDraftVersion } from '../ensure-draft-version.server';
import { err, ok, type ServiceResult } from './result';

export interface SetBlockMediaResult {
	collection: string;
	instanceId: number;
	property: string;
	mediaId: number | null;
	state: 'draft';
	draftVersionId: number;
}

export async function setBlockMedia(
	input: {
		collection: string;
		instanceId: number;
		property: string;
		mediaId: number | null;
	},
	options: { userId?: string } = {},
): Promise<ServiceResult<SetBlockMediaResult>> {
	const collection = await getBlockCollectionByName(input.collection);
	if (!collection) {
		return err(
			'COLLECTION_NOT_FOUND',
			`Collection "${input.collection}" not found`,
			404,
		);
	}
	const instance = await getBlockInstanceById(input.instanceId);
	if (!instance || instance.collectionId !== collection.id) {
		return err(
			'INSTANCE_NOT_FOUND',
			`Instance ${input.instanceId} not found in collection "${input.collection}"`,
			404,
		);
	}
	const properties = await getBlockSchemaProperties(collection.schemaId);
	const property = properties.find(item => item.name === input.property);
	if (!property) {
		return err(
			'PROPERTY_NOT_FOUND',
			`Property "${input.property}" not found`,
			404,
		);
	}
	if (property.type !== 'media') {
		return err(
			'PROPERTY_TYPE_MISMATCH',
			`Property "${input.property}" is not media`,
			400,
		);
	}
	if (input.mediaId != null && !(await getMediaById(input.mediaId))) {
		return err('MEDIA_NOT_FOUND', `Media ${input.mediaId} not found`, 404);
	}

	await ensureDraftVersion(options.userId);
	await upsertBlockInstanceValue({
		instanceId: instance.id,
		propertyId: property.id,
		mediaId: input.mediaId,
	});
	const draft = await getLatestVersion('draft');
	return ok({
		...input,
		state: 'draft',
		draftVersionId: draft!.id,
	});
}
