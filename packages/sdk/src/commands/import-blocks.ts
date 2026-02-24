import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

export interface ImportBlocksOptions {
	locale?: string;
}

/**
 * Import block instances from a JSON file into a collection.
 */
export async function importBlocks(
	config: EdgeCMSConfig,
	file: string,
	collection: string,
	options: ImportBlocksOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const locale = options.locale || config.defaultLocale;

	const filePath = resolve(process.cwd(), file);

	try {
		await access(filePath);
	} catch {
		throw new Error(`File not found: ${filePath}`);
	}

	let items: Record<string, unknown>[];
	try {
		const content = await readFile(filePath, 'utf-8');
		items = JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
	}

	if (!Array.isArray(items)) {
		throw new Error('JSON file must contain an array of objects');
	}

	console.log(
		`Importing ${items.length} items into "${collection}" (locale: ${locale})...`,
	);

	const response = await client.importBlocks(collection, items, locale);

	if (response.success) {
		console.log(
			`\nImport complete! ${response.instancesCreated} instances created.`,
		);
	} else {
		throw new Error('Import failed: unexpected response');
	}
}
