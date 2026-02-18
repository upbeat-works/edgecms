// Shared utilities and types for blocks that can be used on both client and server

/**
 * Build translation key for block instance property
 * Format: blocks.<schemaName>.<instanceId>.<propertyName>
 */
export function buildTranslationKey(
	schemaName: string,
	instanceId: number,
	propertyName: string,
): string {
	return `blocks.${schemaName}.${instanceId}.${propertyName}`;
}

// Block types (shared between client and server)
export interface BlockSchema {
	id: number;
	name: string;
	createdAt: string;
}

export interface BlockSchemaProperty {
	id: number;
	schemaId: number;
	name: string;
	type: 'string' | 'translation' | 'media' | 'boolean' | 'block' | 'collection';
	refSchemaId: number | null;
	position: number;
}

export interface BlockCollection {
	id: number;
	name: string;
	schemaId: number;
	section: string | null;
	isCollection: boolean;
	createdAt: string;
}

export interface BlockInstance {
	id: number;
	schemaId: number;
	collectionId: number | null;
	parentInstanceId: number | null;
	parentPropertyId: number | null;
	position: number;
	createdAt: string;
}

export interface BlockInstanceValue {
	id: number;
	instanceId: number;
	propertyId: number;
	stringValue: string | null;
	booleanValue: number | null;
	mediaId: number | null;
}
