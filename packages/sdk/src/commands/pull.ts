import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';
import { generateTypes } from '../codegen.js';

export interface PullOptions {
	version?: 'draft' | 'live';
}

/**
 * Pull translations from EdgeCMS and write to local files.
 * Also generates TypeScript types.
 */
export async function pull(
	config: EdgeCMSConfig,
	options: PullOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const version = options.version || 'live';

	console.log(`Pulling translations (version: ${version})...`);

	const response = await client.pull(version);

	// Ensure locales directory exists
	const localesDir = resolve(process.cwd(), config.localesDir);
	if (!existsSync(localesDir)) {
		mkdirSync(localesDir, { recursive: true });
		console.log(`Created directory: ${config.localesDir}`);
	}

	// Write JSON files for each locale
	let totalKeys = 0;
	for (const [locale, translations] of Object.entries(response.translations)) {
		const filePath = resolve(localesDir, `${locale}.json`);
		const content = JSON.stringify(translations, null, 2);
		writeFileSync(filePath, content + '\n', 'utf-8');

		const keyCount = Object.keys(translations).length;
		totalKeys = Math.max(totalKeys, keyCount);
		console.log(`  ${locale}.json (${keyCount} keys)`);
	}

	// Generate TypeScript types from default locale keys
	const defaultTranslations =
		response.translations[config.defaultLocale] ||
		response.translations[response.defaultLocale || ''] ||
		Object.values(response.translations)[0] ||
		{};

	const keys = Object.keys(defaultTranslations);
	const typesContent = generateTypes(keys);

	// Ensure types output directory exists
	const typesPath = resolve(process.cwd(), config.typesOutputPath);
	const typesDir = dirname(typesPath);
	if (!existsSync(typesDir)) {
		mkdirSync(typesDir, { recursive: true });
	}

	writeFileSync(typesPath, typesContent, 'utf-8');
	console.log(`  ${config.typesOutputPath} (${keys.length} keys)`);

	console.log(
		`\nPull complete! ${response.languages.length} locales, ${totalKeys} keys.`,
	);
}
