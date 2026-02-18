import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

export interface PushOptions {
	section?: string;
}

/**
 * Push local translations to EdgeCMS.
 * Only pushes the default locale.
 */
export async function push(
	config: EdgeCMSConfig,
	options: PushOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const locale = config.defaultLocale;

	// Read local translations file
	const localesDir = resolve(process.cwd(), config.localesDir);
	const filePath = resolve(localesDir, `${locale}.json`);

	if (!existsSync(filePath)) {
		throw new Error(
			`Translations file not found: ${filePath}\n` +
				`Run 'edgecms pull' first to download translations.`,
		);
	}

	let translations: Record<string, string>;
	try {
		const content = readFileSync(filePath, 'utf-8');
		translations = JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
	}

	const keyCount = Object.keys(translations).length;
	console.log(`Pushing ${locale}.json (${keyCount} keys)...`);

	if (options.section) {
		console.log(`  Section: ${options.section}`);
	}

	const response = await client.push(locale, translations, options.section);

	if (response.success) {
		console.log(`\nPush complete! ${response.keysUpdated} keys updated.`);
		console.log(
			'\nNote: Changes are saved as a draft. Publish from the CMS to make them live.',
		);
	} else {
		throw new Error('Push failed: unexpected response');
	}
}
