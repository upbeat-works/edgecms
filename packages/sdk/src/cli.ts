#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { pull } from './commands/pull.js';
import { push } from './commands/push.js';
import { importBlocks } from './commands/import-blocks.js';

const program = new Command();

program
	.name('edgecms')
	.description('CLI SDK for EdgeCMS i18n - pull and push translations')
	.version('0.1.0');

program
	.command('pull')
	.description('Pull translations from EdgeCMS and generate TypeScript types')
	.option('--from <from>', 'Pull from "draft" or "live"', 'live')
	.action(async options => {
		try {
			const config = loadConfig();
			await pull(config, { version: options.from });
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
			const config = loadConfig();
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
			const config = loadConfig();
			await importBlocks(config, file, collection, { locale: options.locale });
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program.parse();
