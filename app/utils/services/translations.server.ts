import { getLanguages } from '../db/languages.server';
import { getMissingTranslationsForLanguage } from '../db/translations.server';
import { err, ok, type ServiceResult } from './result';

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
