import { getBlockOwnedTranslationKeys } from '../db/blocks.server';
import { getLanguages } from '../db/languages.server';
import {
	deleteTranslationsByKeys,
	getExistingTranslationKeys,
	getMissingTranslationsForLanguage,
} from '../db/translations.server';
import { ensureDraftVersion } from '../ensure-draft-version.server';
import { err, ok, type ServiceResult } from './result';

export interface DeleteKeysResult {
	dryRun: boolean;
	requested: number;
	/** Deleted, or — under a dry run — what deleting would remove. */
	deleted: string[];
	/** Keys a block instance depends on. Never deleted. */
	protected: string[];
	/** Keys the CMS does not hold. */
	missing: string[];
}

/**
 * Delete translation keys and every locale's value for them.
 *
 * Defaults to a dry run: deleting is the caller's explicit choice, never the
 * consequence of getting a flag wrong. Whichever way it is called, the report
 * is the same, so a dry run says exactly what the real run will do.
 */
export async function deleteTranslationKeys(
	keys: string[],
	options: { dryRun?: boolean; userId?: string } = {},
): Promise<ServiceResult<DeleteKeysResult>> {
	const dryRun = options.dryRun !== false;
	const requested = [...new Set(keys.filter(key => key.trim() !== ''))];

	if (requested.length === 0) {
		return err('NO_KEYS', 'No keys were given to delete', 400);
	}

	const [existing, blockOwned] = await Promise.all([
		getExistingTranslationKeys(requested).then(found => new Set(found)),
		getBlockOwnedTranslationKeys().then(found => new Set(found)),
	]);

	// Report in the order asked for, so a caller can read the result against
	// the list they sent.
	const missing = requested.filter(key => !existing.has(key));
	const present = requested.filter(key => existing.has(key));
	const protectedKeys = present.filter(key => blockOwned.has(key));
	const deletable = present.filter(key => !blockOwned.has(key));

	if (!dryRun && deletable.length > 0) {
		await ensureDraftVersion(options.userId);
		await deleteTranslationsByKeys(deletable);
	}

	return ok({
		dryRun,
		requested: requested.length,
		deleted: deletable,
		protected: protectedKeys,
		missing,
	});
}

export interface MissingKey {
	key: string;
	section: string | null;
	defaultValue: string;
}

export interface MissingTranslationsResult {
	defaultLocale: string;
	totalMissing: number;
	locales: Record<string, { missingCount: number; keys: MissingKey[] }>;
}

/**
 * Report keys that exist in the default locale but are absent — or present and
 * empty — in a target locale. Without `locale`, covers every non-default
 * locale.
 */
export async function getMissingTranslations(
	locale?: string,
): Promise<ServiceResult<MissingTranslationsResult>> {
	const languages = await getLanguages();
	const defaultLocale = languages.find(l => l.default)?.locale;

	if (defaultLocale == null) {
		return err(
			'NO_DEFAULT_LANGUAGE',
			'No default language is set. Set one with PATCH /api/i18n/languages.',
			409,
		);
	}

	let targets: string[];
	if (locale == null) {
		targets = languages.filter(l => !l.default).map(l => l.locale);
	} else {
		const match = languages.find(
			l => l.locale.toLowerCase() === locale.toLowerCase(),
		);
		if (!match) {
			return err(
				'LOCALE_NOT_FOUND',
				`Locale "${locale}" does not exist. Available locales: ${languages
					.map(l => l.locale)
					.join(', ')}`,
				404,
			);
		}
		targets = [match.locale];
	}

	const locales: MissingTranslationsResult['locales'] = {};
	let totalMissing = 0;

	for (const target of targets) {
		const missing = await getMissingTranslationsForLanguage(
			defaultLocale,
			target,
		);

		locales[target] = {
			missingCount: missing.length,
			keys: missing.map(row => ({
				key: row.key,
				section: row.section,
				defaultValue: row.value,
			})),
		};
		totalMissing += missing.length;
	}

	return ok({ defaultLocale, totalMissing, locales });
}
