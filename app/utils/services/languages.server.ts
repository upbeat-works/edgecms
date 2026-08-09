import {
	createLanguage as createLanguageRow,
	deleteLanguage as deleteLanguageRow,
	getLanguages,
	setDefaultLanguage as setDefaultLanguageRow,
} from '../db/languages.server';
import { ensureDraftVersion } from '../ensure-draft-version.server';
import { err, ok, type ServiceResult } from './result';

export interface LanguageResult {
	locale: string;
	default: boolean;
}

export interface CreateLanguageOptions {
	makeDefault?: boolean;
	userId?: string;
}

/**
 * Normalise a locale tag to its canonical BCP-47 casing ("EN-us" -> "en-US"),
 * so the same language can't be created twice under different spellings.
 * Returns null if the tag isn't structurally valid.
 */
function canonicalizeLocale(locale: string): string | null {
	const trimmed = locale.trim();
	if (trimmed === '') return null;

	try {
		// A non-empty string yields exactly one canonical tag or throws.
		const [canonical] = Intl.getCanonicalLocales(trimmed);
		return canonical;
	} catch {
		// RangeError for malformed tags.
		return null;
	}
}

function findExisting(languages: LanguageResult[], locale: string) {
	return languages.find(l => l.locale.toLowerCase() === locale.toLowerCase());
}

export async function createLanguage(
	locale: string,
	options: CreateLanguageOptions = {},
): Promise<ServiceResult<LanguageResult>> {
	const canonical = canonicalizeLocale(locale);
	if (canonical == null) {
		return err(
			'INVALID_LOCALE',
			`"${locale}" is not a valid locale tag. Expected a BCP-47 tag such as "en" or "pt-BR".`,
			400,
		);
	}

	const existing = await getLanguages();
	if (findExisting(existing, canonical)) {
		return err('LOCALE_EXISTS', `Locale "${canonical}" already exists`, 409);
	}

	// Any content change has to land in a draft version, or it can never be
	// published.
	await ensureDraftVersion(options.userId);

	// The data layer makes the very first language the default on its own.
	await createLanguageRow(canonical);

	const isFirst = existing.length === 0;
	if (options.makeDefault && !isFirst) {
		await setDefaultLanguageRow(canonical);
	}

	return ok({
		locale: canonical,
		default: isFirst || options.makeDefault === true,
	});
}

export async function setDefaultLanguage(
	locale: string,
	options: { userId?: string } = {},
): Promise<ServiceResult<LanguageResult>> {
	const canonical = canonicalizeLocale(locale);
	if (canonical == null) {
		return err(
			'INVALID_LOCALE',
			`"${locale}" is not a valid locale tag. Expected a BCP-47 tag such as "en" or "pt-BR".`,
			400,
		);
	}

	const existing = await getLanguages();
	const match = findExisting(existing, canonical);
	if (!match) {
		return err(
			'LOCALE_NOT_FOUND',
			`Locale "${canonical}" does not exist. Available locales: ${
				existing.map(l => l.locale).join(', ') || '(none)'
			}`,
			404,
		);
	}

	await ensureDraftVersion(options.userId);
	// Use the stored spelling, which may predate canonicalisation.
	await setDefaultLanguageRow(match.locale);

	return ok({ locale: match.locale, default: true });
}

export async function deleteLanguage(
	locale: string,
	options: { userId?: string } = {},
): Promise<ServiceResult<{ locale: string }>> {
	const canonical = canonicalizeLocale(locale);
	if (canonical == null) {
		return err(
			'INVALID_LOCALE',
			`"${locale}" is not a valid locale tag. Expected a BCP-47 tag such as "en" or "pt-BR".`,
			400,
		);
	}

	const existing = await getLanguages();
	const match = findExisting(existing, canonical);
	if (!match) {
		return err('LOCALE_NOT_FOUND', `Locale "${canonical}" does not exist`, 404);
	}
	if (match.default) {
		return err(
			'DEFAULT_LOCALE_DELETE',
			`Locale "${match.locale}" is the default. Choose another default before deleting it.`,
			409,
		);
	}

	await ensureDraftVersion(options.userId);
	await deleteLanguageRow(match.locale);

	return ok({ locale: match.locale });
}

export async function listLanguages(): Promise<
	ServiceResult<{ languages: LanguageResult[]; defaultLocale: string | null }>
> {
	const languages = await getLanguages();

	return ok({
		languages,
		defaultLocale: languages.find(l => l.default)?.locale ?? null,
	});
}
