import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';
import {
	parseBlocksDocument,
	planSchemaApplication,
	type BlocksDocument,
} from '../planning.js';

export const DEFAULT_BLOCKS_FILE = 'blocks.schema.json';

export interface PushBlocksOptions {
	file?: string;
}

/**
 * Apply a blocks document: create any schema, property or collection the CMS is
 * missing. Additive only — nothing declared here can delete or retype what the
 * CMS already holds, so it is safe to re-run.
 */
export async function pushBlocks(
	config: EdgeCMSConfig,
	options: PushBlocksOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const filePath = resolve(
		process.cwd(),
		options.file ?? config.blocksFile ?? DEFAULT_BLOCKS_FILE,
	);

	let document: BlocksDocument;
	try {
		document = JSON.parse(await readFile(filePath, 'utf-8'));
	} catch (error) {
		throw new Error(`Failed to read ${filePath}: ${(error as Error).message}`);
	}

	const { schemas, collections } = parseBlocksDocument(document);

	if (schemas.length === 0 && collections.length === 0) {
		console.log(
			`Nothing to push: ${filePath} declares no schemas or collections.`,
		);
		return;
	}

	console.log(`Applying ${filePath}\n`);

	const { prepass, apply } = planSchemaApplication(schemas);

	const createdUpFront = new Set<string>();
	for (const schema of prepass) {
		const result = await client.applyBlockSchema(schema.name, schema.properties);
		if (result.created) createdUpFront.add(schema.name);
	}

	for (const schema of apply) {
		const result = await client.applyBlockSchema(schema.name, schema.properties);
		const created = result.created || createdUpFront.has(schema.name);

		if (created) {
			console.log(
				`  + schema ${schema.name} (${result.properties.length} ${
					result.properties.length === 1 ? 'property' : 'properties'
				})`,
			);
		} else if (result.propertiesAdded > 0 || result.propertiesUpdated > 0) {
			const changes = [
				result.propertiesAdded > 0 ? `+${result.propertiesAdded}` : null,
				result.propertiesUpdated > 0
					? `${result.propertiesUpdated} described`
					: null,
			].filter(Boolean);
			console.log(`  ~ schema ${schema.name} (${changes.join(', ')})`);
		} else {
			console.log(`  = schema ${schema.name}`);
		}
	}

	for (const collection of collections) {
		const result = await client.createBlockCollection(collection);
		const shape = result.singleton ? 'singleton' : `section ${result.section}`;

		if (result.created) {
			console.log(`  + collection ${collection.name} (${shape})`);
		} else if (result.updated) {
			console.log(`  ~ collection ${collection.name} (${shape})`);
		} else {
			console.log(`  = collection ${collection.name}`);
		}
	}

	console.log(
		'\nNote: these are draft changes. Run `edgecms publish` to make them live.',
	);
}

/**
 * List the schemas the CMS holds, with their properties.
 */
export async function listSchemas(config: EdgeCMSConfig): Promise<void> {
	const client = new EdgeCMSClient(config);
	const { schemas } = await client.getBlockSchemas();

	if (schemas.length === 0) {
		console.log('No schemas yet. Declare them in blocks.schema.json and run:');
		console.log('  edgecms blocks:push');
		return;
	}

	for (const schema of schemas) {
		console.log(`  ${schema.name}`);
		for (const property of schema.properties) {
			const reference = property.refSchema ? ` -> ${property.refSchema}` : '';
			console.log(`    ${property.name}: ${property.type}${reference}`);
		}
	}
}

/**
 * List the block collections the CMS holds.
 */
export async function listCollections(config: EdgeCMSConfig): Promise<void> {
	const client = new EdgeCMSClient(config);
	const { collections } = await client.getBlockCollections();

	if (collections.length === 0) {
		console.log(
			'No collections yet. Declare them in blocks.schema.json and run:',
		);
		console.log('  edgecms blocks:push');
		return;
	}

	for (const collection of collections) {
		const shape = collection.singleton
			? 'singleton'
			: `${collection.instanceCount} ${
					collection.instanceCount === 1 ? 'item' : 'items'
				}`;
		console.log(`  ${collection.name}  (schema ${collection.schema}, ${shape})`);
	}
}
