import { getBlockOwnedTranslationKeys } from '../db/blocks.server';
import { getLanguages } from '../db/languages.server';
import {
	deleteTranslationsByKeys,
	getExistingTranslationKeys,
	getMissingTranslationsForLanguage,
	getStaleTranslationsForLanguage,
} from '../db/translations.server';
import { ensureDraftVersion } from '../ensure-draft-version.server';
import type { TranslationScope } from '../db/types';
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

interface LocaleScope {
	defaultLocale: string;
	/** The locales to report on: one if asked for, every non-default otherwise. */
	targets: string[];
}

/**
 * Resolve which locales a report covers, refusing the two ways the request can
 * be unanswerable: nothing to compare against, or a locale that does not exist.
 */
async function resolveLocaleScope(
	locale?: string,
): Promise<ServiceResult<LocaleScope>> {
	const languages = await getLanguages();
	const defaultLocale = languages.find(l => l.default)?.locale;

	if (defaultLocale == null) {
		return err(
			'NO_DEFAULT_LANGUAGE',
			'No default language is set. Set one with PATCH /api/i18n/languages.',
			409,
		);
	}

	if (locale == null) {
		return ok({
			defaultLocale,
			targets: languages.filter(l => !l.default).map(l => l.locale),
		});
	}

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

	return ok({ defaultLocale, targets: [match.locale] });
}

/**
 * Report keys that exist in the default locale but are absent — or present and
 * empty — in a target locale. Without `locale`, covers every non-default
 * locale.
 */
export async function getMissingTranslations(
	locale?: string,
): Promise<ServiceResult<MissingTranslationsResult>> {
	const scope = await resolveLocaleScope(locale);
	if (!scope.ok) return scope;
	const { defaultLocale, targets } = scope.data;

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

export interface KeyToTranslate {
	key: string;
	/** The default-locale text to translate from. */
	value: string;
}

/**
 * The default-locale values a target locale has no usable translation for.
 *
 * Under `missing` that is only the keys it never answered; `missing-and-stale`
 * adds the ones whose source text changed after they were translated, which
 * read as complete but no longer say what the source says.
 */
export async function getKeysToTranslate({
	defaultLocale,
	targetLocale,
	scope,
}: {
	defaultLocale: string;
	targetLocale: string;
	scope: TranslationScope;
}): Promise<KeyToTranslate[]> {
	const missing = await getMissingTranslationsForLanguage(
		defaultLocale,
		targetLocale,
	);
	const work = new Map(missing.map(row => [row.key, row.value]));

	if (scope === 'missing-and-stale') {
		const stale = await getStaleTranslationsForLanguage(
			defaultLocale,
			targetLocale,
		);
		// A key emptied after its source changed answers to both rules, and is
		// one unit of work either way.
		for (const row of stale) work.set(row.key, row.defaultValue);
	}

	return [...work].map(([key, value]) => ({ key, value }));
}

export interface StaleKey {
	key: string;
	section: string | null;
	/** The default-locale value as it now stands. */
	defaultValue: string;
	/** The translation, written against an earlier default value. */
	currentValue: string;
}

export interface StaleTranslationsResult {
	defaultLocale: string;
	totalStale: number;
	locales: Record<string, { staleCount: number; keys: StaleKey[] }>;
}

/**
 * Report translations whose default-locale value changed after they were
 * written. They still read as complete — `missing` will never mention them —
 * but they answer a question the source no longer asks. Without `locale`,
 * covers every non-default locale.
 */
export async function getStaleTranslations(
	locale?: string,
): Promise<ServiceResult<StaleTranslationsResult>> {
	const scope = await resolveLocaleScope(locale);
	if (!scope.ok) return scope;
	const { defaultLocale, targets } = scope.data;

	const locales: StaleTranslationsResult['locales'] = {};
	let totalStale = 0;

	for (const target of targets) {
		const stale = await getStaleTranslationsForLanguage(defaultLocale, target);

		locales[target] = {
			staleCount: stale.length,
			keys: stale.map(row => ({
				key: row.key,
				section: row.section,
				defaultValue: row.defaultValue,
				currentValue: row.value,
			})),
		};
		totalStale += stale.length;
	}

	return ok({ defaultLocale, totalStale, locales });
}
