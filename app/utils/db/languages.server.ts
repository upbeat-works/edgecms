import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { languages, translations } from '../schema.server';
import type { Language } from './types';

const db = drizzle(env.DB);

// Language operations
export async function getLanguages(): Promise<Language[]> {
	const result = await db.select().from(languages).orderBy(languages.locale);
	return result.map(row => ({
		locale: row.locale,
		default: row.default || false,
	}));
}

/** The locale every other one is translated from, if one is set. */
export async function getDefaultLocale(): Promise<string | null> {
	const [row] = await db
		.select({ locale: languages.locale })
		.from(languages)
		.where(eq(languages.default, true));

	return row?.locale ?? null;
}

export async function createLanguage(locale: string) {
	const [{ count: languageCount }] = await db
		.select({ count: count() })
		.from(languages);

	await db.insert(languages).values({
		locale,
		default: languageCount === 0,
	});
}

export async function setDefaultLanguage(locale: string) {
	if ((await getDefaultLocale()) === locale) return;

	// Clearing the old default for a locale that turns out not to exist would
	// leave the catalogue with no source locale at all — which fails every
	// staleness query and blocks AI translation — and discard every recorded
	// hash on the way there, unrecoverably.
	const [existing] = await db
		.select({ locale: languages.locale })
		.from(languages)
		.where(eq(languages.locale, locale));
	if (!existing) return;

	// One batch, so no reader sees the moment between the old default being
	// cleared and the new one being set — which reads as "no default language"
	// and fails every staleness query.
	await db.batch([
		db
			.update(languages)
			.set({ default: false })
			.where(eq(languages.default, true)),
		db
			.update(languages)
			.set({ default: true })
			.where(eq(languages.locale, locale)),
		// Every recorded source hash describes the locale that was default until
		// now, so none of them says anything about the new one — and the old
		// values they were taken from are gone. Staleness starts over from here
		// rather than reporting the whole catalogue.
		db.update(translations).set({ sourceHash: null }),
	]);
}
