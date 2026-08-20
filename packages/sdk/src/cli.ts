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
import {
	addSection,
	assignKeysToSection,
	assignMediaToSection,
	listSections,
	removeSection,
	renameSection,
} from './commands/sections.js';
import { publish, publishStatus } from './commands/publish.js';
import { check } from './commands/check.js';
import { stale } from './commands/stale.js';
import { deleteKeys, prune } from './commands/keys.js';
import { listCollections, listSchemas, pushBlocks } from './commands/blocks.js';
import {
	attachBlockMedia,
	listMedia,
	renameMediaFile,
	replaceMediaFile,
	uploadMediaFile,
} from './commands/media.js';

// '../package.json' resolves correctly from both src/ and dist/.
const { version } = createRequire(import.meta.url)('../package.json') as {
	version: string;
};

const program = new Command();

program
	.name('edgecms')
	.description(
		'CLI for EdgeCMS — manage translations, languages, sections, blocks, media, and releases',
	)
	.version(version);

program
	.command('media')
	.description('List and search media')
	.option('--search <text>', 'Search filenames')
	.option('--section <section>', 'Filter by section')
	.option('--state <state>', 'Filter by "live" or "archived"')
	.option('--all-versions', 'Include every revision')
	.action(async options => {
		try {
			if (
				options.state &&
				options.state !== 'live' &&
				options.state !== 'archived'
			) {
				throw new Error('State must be "live" or "archived"');
			}
			await listMedia(await loadConfig(), {
				search: options.search,
				section: options.section,
				state: options.state,
				allVersions: options.allVersions,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('media:upload')
	.description('Upload a media file')
	.argument('<file>', 'File to upload')
	.option('--section <section>', 'Media section')
	.action(async (file, options) => {
		try {
			await uploadMediaFile(await loadConfig(), file, {
				section: options.section,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('media:replace')
	.description('Replace a media revision without changing its canonical URL')
	.argument('<media-id>', 'Media revision ID', value => Number(value))
	.argument('<file>', 'Replacement file')
	.action(async (mediaId, file) => {
		try {
			if (!Number.isInteger(mediaId) || mediaId < 1)
				throw new Error('Invalid media ID');
			await replaceMediaFile(await loadConfig(), mediaId, file);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('media:rename')
	.description('Rename a media file and all of its revisions')
	.argument('<media-id>', 'Media revision ID', value => Number(value))
	.argument('<filename>', 'New filename')
	.action(async (mediaId, filename) => {
		try {
			if (!Number.isInteger(mediaId) || mediaId < 1)
				throw new Error('Invalid media ID');
			await renameMediaFile(await loadConfig(), mediaId, filename);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('blocks:set-media')
	.description('Attach a media ID to a block instance property')
	.argument('<collection>', 'Block collection name')
	.argument('<instance-id>', 'Block instance ID', value => Number(value))
	.argument('<property>', 'Media property name')
	.argument('<media-id>', 'Media revision ID', value => Number(value))
	.action(async (collection, instanceId, property, mediaId) => {
		try {
			if (
				![instanceId, mediaId].every(
					value => Number.isInteger(value) && value > 0,
				)
			) {
				throw new Error('Instance and media IDs must be positive integers');
			}
			await attachBlockMedia(await loadConfig(), {
				collection,
				instanceId,
				property,
				mediaId,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

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
	.command('prune')
	.description(
		'Delete keys the CMS holds that the local translations file no longer has. Reports without deleting unless --yes is given.',
	)
	.option('--yes', 'Actually delete, instead of reporting what would go')
	.option('--verbose', 'List every key instead of a sample')
	.action(async options => {
		try {
			await prune(await loadConfig(), {
				yes: options.yes,
				verbose: options.verbose,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('keys:delete')
	.description(
		'Delete named translation keys. Reports without deleting unless --yes is given.',
	)
	.argument('<keys...>', 'Keys to delete')
	.option('--yes', 'Actually delete, instead of reporting what would go')
	.option('--verbose', 'List every key instead of a sample')
	.action(async (keys, options) => {
		try {
			await deleteKeys(await loadConfig(), keys, {
				yes: options.yes,
				verbose: options.verbose,
			});
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('blocks:push')
	.description(
		'Create the schemas, properties and collections declared in blocks.schema.json. Additive: never deletes or retypes.',
	)
	.argument('[file]', 'Path to the blocks document')
	.action(async file => {
		try {
			await pushBlocks(await loadConfig(), { file });
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('schemas')
	.description('List the block schemas in the CMS with their properties')
	.action(async () => {
		try {
			await listSchemas(await loadConfig());
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('blocks')
	.description('List the block collections in the CMS')
	.action(async () => {
		try {
			await listCollections(await loadConfig());
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
	.command('sections')
	.description('List sections configured in the CMS')
	.action(async () => {
		try {
			await listSections(await loadConfig());
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('sections:add')
	.description('Create a section')
	.argument('<name>', 'Section name')
	.action(async name => {
		try {
			await addSection(await loadConfig(), name);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('sections:rename')
	.description('Rename a section and keep its content filed under the new name')
	.argument('<name>', 'Current section name')
	.argument('<new-name>', 'New section name')
	.action(async (name, newName) => {
		try {
			await renameSection(await loadConfig(), name, newName);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('sections:assign-keys')
	.description('Assign existing i18n keys to a section')
	.argument('<section>', 'Existing section name')
	.argument('<keys...>', 'Existing i18n keys')
	.action(async (section, keys) => {
		try {
			await assignKeysToSection(await loadConfig(), section, keys);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('sections:assign-media')
	.description('Assign existing media IDs to a section')
	.argument('<section>', 'Existing section name')
	.argument('<media-ids...>', 'Existing media IDs')
	.action(async (section, mediaIds) => {
		try {
			const parsedIds: number[] = mediaIds.map((id: string) => Number(id));
			if (!parsedIds.every(id => Number.isInteger(id) && id > 0)) {
				throw new Error('Media IDs must be positive integers');
			}
			await assignMediaToSection(await loadConfig(), section, parsedIds);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program
	.command('sections:delete')
	.description(
		'Delete a section and leave its content unsorted. Reports without deleting unless --yes is given.',
	)
	.argument('<name>', 'Section name')
	.option('--yes', 'Actually delete, instead of reporting what would happen')
	.action(async (name, options) => {
		try {
			await removeSection(await loadConfig(), name, { yes: options.yes });
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

program
	.command('stale')
	.description(
		'Report translations the default locale has changed out from under. Exits non-zero if any are stale, for use as a CI gate.',
	)
	.option('--locale <locale>', 'Only check a single locale')
	.option('--verbose', 'List every stale key instead of a sample')
	.action(async options => {
		try {
			const count = await stale(await loadConfig(), {
				locale: options.locale,
				verbose: options.verbose,
			});
			if (count > 0) process.exit(1);
		} catch (error) {
			console.error('Error:', (error as Error).message);
			process.exit(1);
		}
	});

program.parse();
