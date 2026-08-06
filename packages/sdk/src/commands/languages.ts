import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

/**
 * List the languages configured in the CMS, marking the default.
 */
export async function listLanguages(config: EdgeCMSConfig): Promise<void> {
	const client = new EdgeCMSClient(config);
	const { languages, defaultLocale } = await client.getLanguages();

	if (languages.length === 0) {
		console.log(
			'No languages yet. Create one with: edgecms languages:add <locale>',
		);
		return;
	}

	for (const language of languages) {
		console.log(`  ${language.locale}${language.default ? '  (default)' : ''}`);
	}

	if (!defaultLocale) {
		console.log(
			'\nWarning: no default language is set, so publishing will fail.\n' +
				'Set one with: edgecms languages:set-default <locale>',
		);
	}
}

export interface AddLanguageOptions {
	makeDefault?: boolean;
}

export async function addLanguage(
	config: EdgeCMSConfig,
	locale: string,
	options: AddLanguageOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const language = await client.createLanguage(locale, {
		makeDefault: options.makeDefault,
	});

	// The server canonicalises the tag, so echo back what was actually created.
	console.log(
		`Created language "${language.locale}"${
			language.default ? ' and made it the default' : ''
		}.`,
	);
	console.log(
		'\nNote: this is a draft change. Run `edgecms publish` to make it live.',
	);
}

export async function setDefaultLanguage(
	config: EdgeCMSConfig,
	locale: string,
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const language = await client.setDefaultLanguage(locale);

	console.log(`Default language is now "${language.locale}".`);
	console.log(
		'\nNote: this is a draft change. Run `edgecms publish` to make it live.',
	);
}
