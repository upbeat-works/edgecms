import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

export async function listSections(config: EdgeCMSConfig): Promise<void> {
	const client = new EdgeCMSClient(config);
	const { sections } = await client.getSections();

	if (sections.length === 0) {
		console.log(
			'No sections yet. Create one with: edgecms sections:add <name>',
		);
		return;
	}

	for (const section of sections) console.log(`  ${section.name}`);
}

export async function addSection(
	config: EdgeCMSConfig,
	name: string,
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const section = await client.createSection(name);
	console.log(`Created section "${section.name}".`);
}

export async function renameSection(
	config: EdgeCMSConfig,
	name: string,
	newName: string,
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const section = await client.renameSection(name, newName);
	console.log(`Renamed section "${name}" to "${section.name}".`);
}

export async function assignKeysToSection(
	config: EdgeCMSConfig,
	section: string,
	keys: string[],
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const result = await client.assignContentToSection(section, {
		translationKeys: keys,
	});
	const noun = result.translationKeysAssigned === 1 ? 'i18n key' : 'i18n keys';
	console.log(
		`Assigned ${result.translationKeysAssigned} ${noun} to section "${result.section}".`,
	);
}

export async function assignMediaToSection(
	config: EdgeCMSConfig,
	section: string,
	mediaIds: number[],
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const result = await client.assignContentToSection(section, { mediaIds });
	const noun = result.mediaAssigned === 1 ? 'media file' : 'media files';
	console.log(
		`Assigned ${result.mediaAssigned} ${noun} to section "${result.section}".`,
	);
}

export interface DeleteSectionOptions {
	yes?: boolean;
}

export async function removeSection(
	config: EdgeCMSConfig,
	name: string,
	options: DeleteSectionOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const result = await client.deleteSection(name, { dryRun: !options.yes });

	if (result.dryRun) {
		console.log(
			`Would delete section "${result.name}" and leave its content unsorted.`,
		);
		console.log(
			`Run edgecms sections:delete "${result.name}" --yes to delete.`,
		);
		return;
	}

	console.log(`Deleted section "${result.name}". Its content is now unsorted.`);
}
