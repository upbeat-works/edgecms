import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { languages } from '../schema.server';
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
	await db
		.update(languages)
		.set({ default: false })
		.where(eq(languages.default, true));

	await db
		.update(languages)
		.set({ default: true })
		.where(eq(languages.locale, locale));
}
