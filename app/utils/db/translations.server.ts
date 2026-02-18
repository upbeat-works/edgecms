import { drizzle } from 'drizzle-orm/d1';
import { eq, and, or, inArray, like, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { translationKeys, translations } from '../schema.server';
import type { Translation } from './types';

const db = drizzle(env.DB);

// Translation operations
export async function getTranslations({
	section,
	key,
	language,
	query,
}: {
	section?: string;
	key?: string;
	language?: string;
	query?: string;
}): Promise<Translation[]> {
	const filters = [];
	if (section) filters.push(eq(translationKeys.section, section));
	if (key) filters.push(eq(translations.key, key));
	if (language) filters.push(eq(translations.language, language));

	// If query is provided, filter by translation keys or translation values containing the query text
	if (query) {
		// Create a subquery to find keys that have translations containing the query
		// or where the key itself matches the query
		const keysWithMatchingTranslations = db
			.select({ key: translations.key })
			.from(translations)
			.where(
				or(
					like(translations.value, `%${query}%`),
					like(translations.key, `%${query}%`)
				)
			)
			.groupBy(translations.key);

		filters.push(inArray(translations.key, keysWithMatchingTranslations));
	}

	const result = await db
		.select({
			key: translations.key,
			language: translations.language,
			value: translations.value,
			section: translationKeys.section,
		})
		.from(translations)
		.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
		.where(and(...filters))
		.orderBy(translations.key, translations.language);

	return result;
}

export async function getMissingTranslationsForLanguage(
	defaultLanguage: string,
	targetLanguage: string,
): Promise<Translation[]> {
	// SQL query to find translations that exist in default language but not in target language
	const result = await db
		.select({
			key: translations.key,
			language: sql<string>`${defaultLanguage}`.as('language'),
			value: translations.value,
			section: translationKeys.section,
		})
		.from(translations)
		.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
		.where(
			and(
				eq(translations.language, defaultLanguage),
				or(
					sql`${translations.key} NOT IN (
						SELECT t2.key
						FROM ${translations} t2
						WHERE t2.language = ${targetLanguage}
					)`,
					sql`${translations.key} IN (
						SELECT t2.key
						FROM ${translations} t2
						WHERE t2.language = ${targetLanguage}
						AND t2.value = ''
					)`,
				),
			),
		)
		.orderBy(translations.key);

	return result.map(row => ({
		key: row.key,
		language: row.language,
		value: row.value,
		section: row.section,
	}));
}

export async function upsertTranslation(
	key: string,
	language: string,
	value: string,
	section?: string,
) {
	// First, ensure the translation key exists with the correct section
	await db
		.insert(translationKeys)
		.values({
			key,
			section: section || null,
		})
		.onConflictDoUpdate({
			target: [translationKeys.key],
			set: {
				section: section || null,
			},
		});

	// Then, upsert the translation
	await db
		.insert(translations)
		.values({
			key,
			language,
			value,
		})
		.onConflictDoUpdate({
			target: [translations.language, translations.key],
			set: {
				value,
			},
		});
}

export async function bulkUpsertTranslations(
	language: string,
	translationsMap: Record<string, string>,
	section?: string,
) {
	const translationValues = Object.entries(translationsMap).map(
		([key, value]) => ({
			key,
			language,
			value,
		}),
	);

	const keyValues = Object.keys(translationsMap).map(key => ({
		key,
		section: section ?? null,
	}));

	if (translationValues.length === 0) return;

	const BATCH_SIZE = 25;

	// First, upsert all translation keys with their sections
	for (let i = 0; i < keyValues.length; i += BATCH_SIZE) {
		const batch = keyValues.slice(i, i + BATCH_SIZE);
		await db.insert(translationKeys).values(batch).onConflictDoNothing();
	}

	// Then, upsert all translations
	for (let i = 0; i < translationValues.length; i += BATCH_SIZE) {
		const batch = translationValues.slice(i, i + BATCH_SIZE);
		console.log(
			`Upserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(translationValues.length / BATCH_SIZE)} for ${language}`,
		);
		await db
			.insert(translations)
			.values(batch)
			.onConflictDoUpdate({
				target: [translations.language, translations.key],
				set: {
					value: sql`EXCLUDED.value`,
				},
			});
	}
}

export async function updateTranslationKey(
	oldKey: string,
	newKey: string,
): Promise<void> {
	await db
		.update(translationKeys)
		.set({ key: newKey })
		.where(eq(translationKeys.key, oldKey));
}

export async function deleteTranslationsByKeys(keys: string[]): Promise<void> {
	if (keys.length === 0) return;

	const BATCH_SIZE = 25;

	for (let i = 0; i < keys.length; i += BATCH_SIZE) {
		const batch = keys.slice(i, i + BATCH_SIZE);

		// Delete from translation_keys table (CASCADE will handle translations)
		await db.delete(translationKeys).where(inArray(translationKeys.key, batch));
	}
}

// Helper function to update a translation key's section
export async function updateTranslationKeySection(
	key: string,
	section?: string,
): Promise<void> {
	await db
		.update(translationKeys)
		.set({ section: section || null })
		.where(eq(translationKeys.key, key));
}
