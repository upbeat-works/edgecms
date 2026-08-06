import { WorkerEntrypoint, env } from 'cloudflare:workers';
import {
	getBlockCollectionData,
	getLatestVersion,
	getMediaByFilename,
	getTranslations,
} from '~/utils/db.server';
import { getLanguages as getLanguageRows } from '~/utils/db/languages.server';
import { buildVersionedFilename } from '~/utils/media.server';
import {
	createLanguage,
	listLanguages,
	setDefaultLanguage,
	type LanguageResult,
} from '~/utils/services/languages.server';
import {
	getPublishStatus,
	publishDraft,
	type PublishResult,
	type PublishStatusResult,
} from '~/utils/services/publish.server';
import {
	applyBlockSchema,
	createBlockCollection,
	listBlockCollections,
	listBlockSchemas,
	type BlockCollectionResult,
	type BlockPropertyInput,
	type BlockSchemaResult,
} from '~/utils/services/blocks.server';
import {
	deleteTranslationKeys,
	getMissingTranslations,
	type DeleteKeysResult,
	type MissingTranslationsResult,
} from '~/utils/services/translations.server';
import { unwrap } from '~/utils/services/result';

/** Throw with a machine-readable `name`, matching the REST error codes. */
function fail(code: string, message: string): never {
	const error = new Error(message);
	error.name = code;
	throw error;
}

/**
 * RPC surface for Workers in the same account, bound via a service binding:
 *
 *   // consumer wrangler.jsonc
 *   "services": [{ "binding": "EDGECMS", "service": "edgecms", "entrypoint": "EdgeCMSService" }]
 *
 *   // consumer code
 *   const translations = await env.EDGECMS.getTranslations('en')
 *   await env.EDGECMS.createLanguage('pt-BR')
 *
 * Covers the same ground as the REST API without HTTP or API keys — a service
 * binding is already an authenticated, account-private channel. Methods throw on
 * failure, with `error.name` carrying the same code the REST API returns.
 *
 * Read methods serve the live published snapshot, matching the public HTTP
 * endpoints. Write methods share the service layer with the REST routes, so
 * validation and preconditions can't drift between the two.
 */
export class EdgeCMSService extends WorkerEntrypoint<Env> {
	/**
	 * Translations for a locale, from the live R2 snapshot.
	 */
	async getTranslations(locale: string): Promise<Record<string, string>> {
		const liveVersion = await getLatestVersion('live');
		if (!liveVersion) {
			fail('NO_LIVE_VERSION', 'No live version found');
		}

		const file = await env.BACKUPS_BUCKET.get(
			`${liveVersion.id}/${locale}.json`,
		);
		if (!file) {
			fail(
				'LOCALE_NOT_FOUND',
				`No translation file found for locale: ${locale}`,
			);
		}

		return file.json();
	}

	/**
	 * Block collection data from the live R2 snapshot, falling back to D1 when
	 * nothing has been published yet.
	 */
	async getBlocks(collection: string) {
		const liveVersion = await getLatestVersion('live');

		if (liveVersion) {
			const file = await env.BACKUPS_BUCKET.get(
				`${liveVersion.id}/blocks/${collection}.json`,
			);
			if (file) {
				return file.json();
			}
			// Collection was added after publish — don't leak draft content.
			fail('COLLECTION_NOT_FOUND', `Collection not found: ${collection}`);
		}

		const data = await getBlockCollectionData(collection);
		if (!data) {
			fail('COLLECTION_NOT_FOUND', `Collection not found: ${collection}`);
		}
		return data;
	}

	/**
	 * Media metadata plus a streaming body from R2.
	 */
	async getMedia(
		filename: string,
		version?: number,
	): Promise<{
		contentType: string;
		size: number;
		etag: string;
		body: ReadableStream;
	}> {
		const media = await getMediaByFilename(filename, version);
		if (!media) {
			fail('MEDIA_NOT_FOUND', `Media not found: ${filename}`);
		}

		const versionedFilename = buildVersionedFilename(
			media.filename,
			media.version,
		);
		const object = await env.MEDIA_BUCKET.get(versionedFilename);
		if (!object) {
			fail('MEDIA_NOT_FOUND', `Media file not found in storage: ${filename}`);
		}

		return {
			contentType: media.mimeType,
			size: media.sizeBytes,
			etag: object.httpEtag,
			body: object.body,
		};
	}

	/**
	 * Available languages and the default locale.
	 */
	async getLanguages(): Promise<{
		languages: LanguageResult[];
		defaultLocale: string | null;
	}> {
		return unwrap(await listLanguages());
	}

	/**
	 * All translations grouped by locale, from the draft state in D1.
	 */
	async pullTranslations(): Promise<{
		languages: LanguageResult[];
		defaultLocale: string | null;
		translations: Record<string, Record<string, string>>;
	}> {
		const [languages, allTranslations] = await Promise.all([
			getLanguageRows(),
			getTranslations({}),
		]);

		const translationsByLocale: Record<string, Record<string, string>> = {};
		for (const lang of languages) {
			translationsByLocale[lang.locale] = {};
		}
		// Every bucket already exists: `translations.language` is a foreign key
		// onto `languages.locale`, so no translation can name an unknown locale.
		for (const translation of allTranslations) {
			translationsByLocale[translation.language][translation.key] =
				translation.value;
		}

		return {
			languages,
			defaultLocale: languages.find(l => l.default)?.locale ?? null,
			translations: translationsByLocale,
		};
	}

	/**
	 * Keys present in the default locale but missing or empty elsewhere.
	 */
	async missingTranslations(
		locale?: string,
	): Promise<MissingTranslationsResult> {
		return unwrap(await getMissingTranslations(locale));
	}

	async createLanguage(
		locale: string,
		options: { makeDefault?: boolean } = {},
	): Promise<LanguageResult> {
		return unwrap(
			await createLanguage(locale, { makeDefault: options.makeDefault }),
		);
	}

	async setDefaultLanguage(locale: string): Promise<LanguageResult> {
		return unwrap(await setDefaultLanguage(locale));
	}

	/**
	 * Delete translation keys and every locale's value for them.
	 *
	 * Dry run unless `dryRun: false` is passed, and keys owned by block
	 * instances are never deleted — they come back under `protected`.
	 */
	async deleteTranslationKeys(
		keys: string[],
		options: { dryRun?: boolean } = {},
	): Promise<DeleteKeysResult> {
		return unwrap(
			await deleteTranslationKeys(keys, { dryRun: options.dryRun }),
		);
	}

	async getBlockSchemas(): Promise<
		{ name: string; properties: BlockSchemaResult['properties'] }[]
	> {
		return unwrap(await listBlockSchemas()).schemas;
	}

	/**
	 * Create a schema, or add the properties it is missing. Additive: existing
	 * properties are never retyped or dropped.
	 */
	async applyBlockSchema(
		name: string,
		properties: BlockPropertyInput[] = [],
	): Promise<BlockSchemaResult> {
		return unwrap(await applyBlockSchema(name, properties));
	}

	async getBlockCollections(): Promise<
		Omit<BlockCollectionResult, 'created' | 'updated'>[]
	> {
		return unwrap(await listBlockCollections()).collections;
	}

	async createBlockCollection(input: {
		name: string;
		schema: string;
		section?: string;
		singleton?: boolean;
	}): Promise<BlockCollectionResult> {
		return unwrap(await createBlockCollection(input));
	}

	/**
	 * Release the current draft. Asynchronous — poll with `publishStatus`.
	 */
	async publish(): Promise<PublishResult> {
		return unwrap(await publishDraft());
	}

	async publishStatus(publishId: string): Promise<PublishStatusResult> {
		return unwrap(await getPublishStatus(publishId));
	}
}
