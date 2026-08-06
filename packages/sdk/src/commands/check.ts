import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

export interface CheckOptions {
	/** Restrict the report to a single locale. */
	locale?: string;
	/** Print every missing key rather than a capped sample. */
	verbose?: boolean;
}

const SAMPLE_SIZE = 10;

/**
 * Report untranslated keys. Returns the number missing so the CLI can exit
 * non-zero, making this usable as a CI gate.
 */
export async function check(
	config: EdgeCMSConfig,
	options: CheckOptions = {},
): Promise<number> {
	const client = new EdgeCMSClient(config);
	const report = await client.getMissingTranslations(options.locale);

	if (report.totalMissing === 0) {
		const scope = options.locale ? `"${options.locale}" is` : 'All locales are';
		console.log(`${scope} fully translated.`);
		return 0;
	}

	console.log(
		`${report.totalMissing} missing translation${
			report.totalMissing === 1 ? '' : 's'
		} (default locale: ${report.defaultLocale})\n`,
	);

	for (const [locale, entry] of Object.entries(report.locales)) {
		if (entry.missingCount === 0) continue;

		console.log(`  ${locale} — ${entry.missingCount} missing`);

		const shown = options.verbose
			? entry.keys
			: entry.keys.slice(0, SAMPLE_SIZE);
		for (const key of shown) {
			const section = key.section ? ` [${key.section}]` : '';
			console.log(
				`    ${key.key}${section}: ${JSON.stringify(key.defaultValue)}`,
			);
		}

		const hidden = entry.keys.length - shown.length;
		if (hidden > 0) {
			console.log(`    ... and ${hidden} more (use --verbose to list all)`);
		}
	}

	return report.totalMissing;
}
