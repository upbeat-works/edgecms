import { WorkerEntrypoint } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import {
	getLanguages,
	getTranslations,
	getLatestVersion,
	getBlockCollectionData,
	getMediaByFilename,
} from '~/utils/db.server';
import { buildVersionedFilename } from '~/utils/media.server';

export class EdgeCMSService extends WorkerEntrypoint<Env> {
	/**
	 * Returns translations for a locale from the live R2 snapshot.
	 * Falls back to 404 if no live version or snapshot exists.
	 */
	async getTranslations(locale: string): Promise<Record<string, string>> {
		const liveVersion = await getLatestVersion('live');
		if (!liveVersion) {
			throw new Error('No live version found');
		}

		const file = await env.BACKUPS_BUCKET.get(
			`${liveVersion.id}/${locale}.json`,
		);
		if (!file) {
			throw new Error(`No translation file found for locale: ${locale}`);
		}

		return file.json();
	}

	/**
	 * Returns block collection data from the live R2 snapshot,
	 * falling back to DB if no live version exists.
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
			// Collection was added after publish — don't leak draft content
			throw new Error(`Collection not found: ${collection}`);
		}

		// No published version yet — serve from D1
		const data = await getBlockCollectionData(collection);
		if (!data) {
			throw new Error(`Collection not found: ${collection}`);
		}
		return data;
	}

	/**
	 * Returns media file metadata and a ReadableStream body from R2.
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
			throw new Error(`Media not found: ${filename}`);
		}

		const versionedFilename = buildVersionedFilename(
			media.filename,
			media.version,
		);
		const object = await env.MEDIA_BUCKET.get(versionedFilename);
		if (!object) {
			throw new Error(`Media file not found in storage: ${filename}`);
		}

		return {
			contentType: media.mimeType,
			size: media.sizeBytes,
			etag: object.httpEtag,
			body: object.body,
		};
	}

	/**
	 * Returns available languages and the default locale.
	 */
	async getLanguages(): Promise<{
		languages: { locale: string; default: boolean }[];
		defaultLocale: string | null;
	}> {
		const languages = await getLanguages();
		const defaultLocale =
			languages.find(l => l.default)?.locale || null;
		return { languages, defaultLocale };
	}

	/**
	 * Pulls all translations grouped by locale (draft state from DB).
	 */
	async pullTranslations(): Promise<{
		languages: { locale: string; default: boolean }[];
		defaultLocale: string | null;
		translations: Record<string, Record<string, string>>;
	}> {
		const [languages, allTranslations] = await Promise.all([
			getLanguages(),
			getTranslations({}),
		]);

		const defaultLocale =
			languages.find(l => l.default)?.locale || null;

		const translationsByLocale: Record<string, Record<string, string>> = {};
		for (const lang of languages) {
			translationsByLocale[lang.locale] = {};
		}
		for (const translation of allTranslations) {
			if (!translationsByLocale[translation.language]) {
				translationsByLocale[translation.language] = {};
			}
			translationsByLocale[translation.language][translation.key] =
				translation.value;
		}

		return {
			languages,
			defaultLocale,
			translations: translationsByLocale,
		};
	}
}
