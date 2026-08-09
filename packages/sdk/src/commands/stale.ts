import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

export interface StaleOptions {
	/** Restrict the report to a single locale. */
	locale?: string;
	/** Print every stale key rather than a capped sample. */
	verbose?: boolean;
}

const SAMPLE_SIZE = 10;

/**
 * Report translations the default locale has moved on from. Returns how many
 * there are so the CLI can exit non-zero, making this usable as a CI gate.
 */
export async function stale(
	config: EdgeCMSConfig,
	options: StaleOptions = {},
): Promise<number> {
	const client = new EdgeCMSClient(config);
	const report = await client.getStaleTranslations(options.locale);

	if (report.totalStale === 0) {
		const scope = options.locale ? `"${options.locale}" is` : 'All locales are';
		console.log(`${scope} up to date with ${report.defaultLocale}.`);
		return 0;
	}

	console.log(
		`${report.totalStale} translation${report.totalStale === 1 ? '' : 's'} ${
			report.totalStale === 1 ? 'was' : 'were'
		} written against an older ${report.defaultLocale} value\n`,
	);

	for (const [locale, entry] of Object.entries(report.locales)) {
		if (entry.staleCount === 0) continue;

		console.log(`  ${locale} — ${entry.staleCount} stale`);

		const shown = options.verbose
			? entry.keys
			: entry.keys.slice(0, SAMPLE_SIZE);
		for (const key of shown) {
			const section = key.section ? ` [${key.section}]` : '';
			console.log(`    ${key.key}${section}`);
			console.log(
				`      ${report.defaultLocale}: ${JSON.stringify(key.defaultValue)}`,
			);
			console.log(`      ${locale}: ${JSON.stringify(key.currentValue)}`);
		}

		const hidden = entry.keys.length - shown.length;
		if (hidden > 0) {
			console.log(`    ... and ${hidden} more (use --verbose to list all)`);
		}
	}

	return report.totalStale;
}
