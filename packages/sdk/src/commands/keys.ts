import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient, type DeleteKeysResponse } from '../api.js';
import { computeOrphanKeys } from '../planning.js';

const SAMPLE_SIZE = 20;

function printKeys(keys: string[], verbose: boolean) {
	const shown = verbose ? keys : keys.slice(0, SAMPLE_SIZE);
	for (const key of shown) console.log(`  ${key}`);
	if (shown.length < keys.length) {
		console.log(
			`  ... ${keys.length - shown.length} more (--verbose to list all)`,
		);
	}
}

function report(result: DeleteKeysResponse, verbose: boolean) {
	console.log(
		`${result.deleted.length} ${
			result.deleted.length === 1 ? 'key' : 'keys'
		} ${result.dryRun ? 'would be deleted' : 'deleted'}:`,
	);
	printKeys(result.deleted, verbose);

	if (result.protected.length > 0) {
		console.log(
			`\nProtected, will not be deleted — ${result.protected.length} ${
				result.protected.length === 1 ? 'key is' : 'keys are'
			} owned by block instances:`,
		);
		printKeys(result.protected, verbose);
	}

	if (result.missing.length > 0) {
		console.log(
			`\n${result.missing.length} requested ${
				result.missing.length === 1 ? 'key is' : 'keys are'
			} not in the CMS:`,
		);
		printKeys(result.missing, verbose);
	}

	if (result.dryRun) {
		console.log(
			`\nNothing was deleted — this was a dry run. Re-run with --yes to delete ${
				result.deleted.length === 1
					? 'this key'
					: `these ${result.deleted.length} keys`
			}.`,
		);
		return;
	}

	console.log(
		`\nDeleted ${result.deleted.length} ${
			result.deleted.length === 1 ? 'key' : 'keys'
		} from the draft.`,
	);
	console.log('Run `edgecms publish` to make the deletion live.');
}

export interface DeleteKeysOptions {
	yes?: boolean;
	verbose?: boolean;
}

/**
 * Delete named translation keys. Reports what would go unless `yes` is set.
 */
export async function deleteKeys(
	config: EdgeCMSConfig,
	keys: string[],
	options: DeleteKeysOptions = {},
): Promise<DeleteKeysResponse> {
	const client = new EdgeCMSClient(config);
	const result = await client.deleteKeys(keys, { dryRun: !options.yes });

	report(result, options.verbose === true);

	return result;
}

export type PruneOptions = DeleteKeysOptions;

/**
 * Delete the keys the CMS holds that the local translations file no longer
 * mentions — the counterpart to `push`, which only ever adds.
 *
 * Compares against the draft, which is the state the deletion applies to.
 */
export async function prune(
	config: EdgeCMSConfig,
	options: PruneOptions = {},
): Promise<DeleteKeysResponse | null> {
	const client = new EdgeCMSClient(config);
	const locale = config.defaultLocale;

	const filePath = resolve(process.cwd(), config.localesDir, `${locale}.json`);
	try {
		await access(filePath);
	} catch {
		throw new Error(
			`Translations file not found: ${filePath}\n` +
				`Prune compares the CMS against this file, so it cannot run without it.`,
		);
	}

	let local: Record<string, string>;
	try {
		local = JSON.parse(await readFile(filePath, 'utf-8'));
	} catch (error) {
		throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
	}

	if (local == null || typeof local !== 'object' || Array.isArray(local)) {
		throw new Error(
			`${filePath} is not a JSON object of translations, so its keys cannot be compared against the CMS.`,
		);
	}

	const localKeys = new Set(Object.keys(local));

	// An empty file would mark every key in the CMS as an orphan. That is far
	// more likely to be a broken build than a real intention to delete everything.
	if (localKeys.size === 0) {
		throw new Error(
			`${filePath} contains no keys.\n` +
				`Refusing to treat every key in the CMS as unused. Check the file, or ` +
				`delete keys explicitly with 'edgecms keys:delete'.`,
		);
	}

	const remote = await client.pull('draft');
	const remoteTranslations = remote.translations[locale];
	if (!remoteTranslations) {
		throw new Error(
			`The CMS has no draft translations for "${locale}", so there is ` +
				`nothing to compare against.`,
		);
	}

	const remoteKeys = Object.keys(remoteTranslations);
	console.log(
		`Comparing ${locale}.json (${localKeys.size} keys) against the CMS draft (${remoteKeys.length} keys)\n`,
	);

	const orphans = computeOrphanKeys(localKeys, remoteKeys);
	if (orphans.length === 0) {
		console.log('Nothing to prune: every key in the CMS is still in use.');
		return null;
	}

	console.log(
		`${orphans.length} ${
			orphans.length === 1 ? 'key exists' : 'keys exist'
		} in the CMS but not locally.\n`,
	);

	const result = await client.deleteKeys(orphans, { dryRun: !options.yes });
	report(result, options.verbose === true);

	return result;
}
