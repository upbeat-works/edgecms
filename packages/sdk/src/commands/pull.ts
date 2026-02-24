import { writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';
import { generateTypes } from '../codegen.js';

export interface PullOptions {
	version?: 'draft' | 'live';
	allLocales?: boolean;
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
	await mkdir(localesDir, { recursive: true });

	// Determine which locales to write
	const localesToWrite = options.allLocales
		? Object.entries(response.translations)
		: [[
				config.defaultLocale,
				response.translations[config.defaultLocale] ||
					response.translations[response.defaultLocale || ''] ||
					Object.values(response.translations)[0] ||
					{},
			] as const];

	// Write JSON files
	let totalKeys = 0;
	for (const [locale, translations] of localesToWrite) {
		const filePath = resolve(localesDir, `${locale}.json`);
		const content = JSON.stringify(translations, null, 2);
		await writeFile(filePath, content + '\n', 'utf-8');

		const keyCount = Object.keys(translations).length;
		totalKeys = Math.max(totalKeys, keyCount);
		console.log(`  ${locale}.json (${keyCount} keys)`);
	}

	// Resolve default locale translations for type generation
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
	await mkdir(typesDir, { recursive: true });

	await writeFile(typesPath, typesContent, 'utf-8');
	console.log(`  ${config.typesOutputPath} (${keys.length} keys)`);

	const localesSummary = options.allLocales
		? `${localesToWrite.length} locales, `
		: '';
	console.log(`\nPull complete! ${localesSummary}${totalKeys} keys.`);
}
