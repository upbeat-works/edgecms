#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { pull } from './commands/pull.js';
import { push } from './commands/push.js';
import { importBlocks } from './commands/import-blocks.js';
import {
	addLanguage,
	listLanguages,
	setDefaultLanguage,
} from './commands/languages.js';
import { publish, publishStatus } from './commands/publish.js';
import { check } from './commands/check.js';

// '../package.json' resolves correctly from both src/ and dist/.
const { version } = createRequire(import.meta.url)('../package.json') as {
	version: string;
};

const program = new Command();

program
	.name('edgecms')
	.description(
		'CLI for EdgeCMS — manage translations, languages, blocks, and releases',
	)
	.version(version);

program
	.command('pull')
	.description('Pull translations from EdgeCMS and generate TypeScript types')
	.option('--from <from>', 'Pull from "draft" or "live"', 'live')
	.option('--all', 'Pull all locales instead of just the default')
	.action(async options => {
		try {
			const config = await loadConfig();
			await pull(config, { version: options.from, allLocales: options.all });
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('push')
	.description('Push local translations to EdgeCMS (default locale only)')
	.option('-s, --section <section>', 'Section to assign to new keys')
	.action(async options => {
		try {
			const config = await loadConfig();
			await push(config, { section: options.section });
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('import-blocks')
	.description('Import block instances from a JSON file into a collection')
	.argument('<file>', 'Path to JSON file containing items array')
	.argument('<collection>', 'Name of the block collection')
	.option(
		'--locale <locale>',
		'Locale for translation values (defaults to config defaultLocale)',
	)
	.action(async (file, collection, options) => {
		try {
			const config = await loadConfig();
			await importBlocks(config, file, collection, { locale: options.locale });
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('languages')
	.description('List the languages configured in the CMS')
	.action(async () => {
		try {
			await listLanguages(await loadConfig());
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('languages:add')
	.description('Create a language (the first one created becomes the default)')
	.argument('<locale>', 'BCP-47 locale tag, e.g. "en" or "pt-BR"')
	.option('--default', 'Also make this the default language')
	.action(async (locale, options) => {
		try {
			await addLanguage(await loadConfig(), locale, {
				makeDefault: options.default,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('languages:set-default')
	.description('Make an existing language the default')
	.argument('<locale>', 'Locale to make default')
	.action(async locale => {
		try {
			await setDefaultLanguage(await loadConfig(), locale);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('publish')
	.description('Publish the current draft, making it live')
	.option('--wait', 'Wait for the release to finish before exiting')
	.option(
		'--timeout <seconds>',
		'How long to wait when using --wait',
		value => parseInt(value, 10) * 1000,
	)
	.action(async options => {
		try {
			await publish(await loadConfig(), {
				wait: options.wait,
				timeoutMs: options.timeout,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('publish:status')
	.description('Check the status of a publish')
	.argument('<publishId>', 'Id returned by `edgecms publish`')
	.action(async publishId => {
		try {
			await publishStatus(await loadConfig(), publishId);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('check')
	.description(
		'Report untranslated keys. Exits non-zero if any are missing, for use as a CI gate.',
	)
	.option('--locale <locale>', 'Only check a single locale')
	.option('--verbose', 'List every missing key instead of a sample')
	.action(async options => {
		try {
			const missing = await check(await loadConfig(), {
				locale: options.locale,
				verbose: options.verbose,
			});
			if (missing > 0) process.exit(1);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program.parse();
