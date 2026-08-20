import { drizzle } from 'drizzle-orm/d1';
import { eq, and, or, inArray, like, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
	languages,
	sections,
	translationKeys,
	translations,
} from '../schema.server';
import { hashValue } from '../hash';
import { batchSizeForColumns } from './d1.server';
import { getDefaultLocale } from './languages.server';
import type { StaleTranslation, Translation, UntranslatedKey } from './types';

const db = drizzle(env.DB);

// The default locale is the source every other locale is translated from.
const sourceTranslation = alias(translations, 'source_translation');

/**
 * Scalar rather than a join on `default = true`: nothing in the schema stops a
 * second row being marked default, and joining on the predicate would then
 * return every translation twice.
 */
const sourceLocale = sql`(SELECT ${languages.locale} FROM ${languages} WHERE ${languages.default} = 1 LIMIT 1)`;

/**
 * Whether the default-locale value has moved on since a translation was written
 * — that is, whether the hash the translation recorded is still the one the
 * source row carries.
 *
 * A source row holding no hash is not evidence of anything: it means the value
 * has not been written since hashes were recorded, not that it stands still. So
 * it is judged against nothing, which keeps two whole catalogues quiet — one
 * predating this tracking, and one where the default locale has just changed —
 * rather than reporting every key in them. Either starts reporting the moment a
 * default value genuinely changes and records a hash to compare against.
 *
 * `IS NOT` on the translation's own hash, so one written before this was tracked
 * still reports once its source records one. An empty source value is a missing
 * default rather than a source to answer, and nothing is stale against it.
 */
const sourceHasMovedOn = sql`${sourceTranslation.sourceHash} IS NOT NULL
	AND ${sourceTranslation.value} <> ''
	AND ${translations.sourceHash} IS NOT ${sourceTranslation.sourceHash}`;

/** An empty translation is missing, not stale, and is left to the missing report. */
const isStale = sql<number>`CASE WHEN ${translations.language} <> ${sourceLocale}
	AND ${translations.value} <> ''
	AND ${sourceHasMovedOn}
	THEN 1 ELSE 0 END`;

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
					like(translations.key, `%${query}%`),
				),
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
			sourceHash: translations.sourceHash,
			stale: isStale,
		})
		.from(translations)
		.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
		.leftJoin(
			sourceTranslation,
			and(
				eq(sourceTranslation.key, translations.key),
				eq(sourceTranslation.language, sourceLocale),
			),
		)
		.where(and(...filters))
		.orderBy(translations.key, translations.language);

	return result.map(row => ({ ...row, stale: row.stale === 1 }));
}

/**
 * Translations left behind by a change to the default-locale value: still
 * present, but written against a default value that has since moved on.
 */
export async function getStaleTranslationsForLanguage(
	defaultLanguage: string,
	targetLanguage: string,
): Promise<StaleTranslation[]> {
	return db
		.select({
			key: translations.key,
			section: translationKeys.section,
			defaultValue: sourceTranslation.value,
			value: translations.value,
		})
		.from(translations)
		.innerJoin(
			sourceTranslation,
			and(
				eq(sourceTranslation.key, translations.key),
				eq(sourceTranslation.language, defaultLanguage),
			),
		)
		.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
		.where(
			and(
				eq(translations.language, targetLanguage),
				ne(translations.value, ''),
				sourceHasMovedOn,
			),
		)
		.orderBy(translations.key);
}

export async function getMissingTranslationsForLanguage(
	defaultLanguage: string,
	targetLanguage: string,
): Promise<UntranslatedKey[]> {
	// SQL query to find translations that exist in default language but not in target language
	const result = await db
		.select({
			key: translations.key,
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

	return result;
}

/**
 * The hash each key's default-locale value currently carries — what a
 * translation written now is answering. Batched to stay under D1's cap of 100
 * bound parameters per statement.
 */
async function getSourceHashes(
	keys: string[],
): Promise<Map<string, string | null>> {
	const hashes = new Map<string, string | null>();
	const BATCH_SIZE = 90;

	for (let i = 0; i < keys.length; i += BATCH_SIZE) {
		const batch = keys.slice(i, i + BATCH_SIZE);
		const rows = await db
			.select({
				key: translations.key,
				sourceHash: translations.sourceHash,
			})
			.from(translations)
			.innerJoin(languages, eq(languages.locale, translations.language))
			.where(
				and(eq(languages.default, true), inArray(translations.key, batch)),
			);

		for (const row of rows) hashes.set(row.key, row.sourceHash);
	}

	return hashes;
}

/**
 * Rewriting a default value with the same text is not a change, so it must not
 * re-anchor the hash. Without this, a re-push of an unchanged source file would
 * stamp a hash onto rows that never had one and mark every other locale stale.
 */
const rehashOnlyOnChange = sql`CASE
	WHEN ${translations.value} = EXCLUDED.value THEN ${translations.sourceHash}
	ELSE EXCLUDED.sourceHash
END`;

/**
 * Record that a translation answers the default value as it now stands,
 * without touching the translation itself — for when a reviewer decides a
 * translation survives a change to the default value.
 */
export async function markTranslationCurrent(
	key: string,
	language: string,
): Promise<void> {
	const sourceHash = (await getSourceHashes([key])).get(key) ?? null;

	await db
		.update(translations)
		.set({ sourceHash })
		.where(and(eq(translations.key, key), eq(translations.language, language)));
}

/**
 * Which of `keys` the CMS actually holds. Batched to stay under D1's cap of 100
 * bound parameters per statement.
 */
export async function getExistingTranslationKeys(
	keys: string[],
): Promise<string[]> {
	if (keys.length === 0) return [];

	const BATCH_SIZE = 90;
	const found: string[] = [];

	for (let i = 0; i < keys.length; i += BATCH_SIZE) {
		const batch = keys.slice(i, i + BATCH_SIZE);
		const rows = await db
			.select({ key: translationKeys.key })
			.from(translationKeys)
			.where(inArray(translationKeys.key, batch));
		found.push(...rows.map(row => row.key));
	}

	return found;
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

	const isDefaultLocale = language === (await getDefaultLocale());

	// A default value is the source everything else answers, so it records its
	// own hash; every other locale records the hash of the source it was
	// written against.
	const sourceHash = isDefaultLocale
		? hashValue(value)
		: ((await getSourceHashes([key])).get(key) ?? null);

	await db
		.insert(translations)
		.values({
			key,
			language,
			value,
			sourceHash,
		})
		.onConflictDoUpdate({
			target: [translations.language, translations.key],
			set: {
				value,
				sourceHash: isDefaultLocale
					? rehashOnlyOnChange
					: sql`EXCLUDED.sourceHash`,
			},
		});
}

/**
 * What each translation being written answers, as a hash.
 *
 * A caller that translated from text it read earlier says so through
 * `translatedFrom`, and is taken at its word: re-reading the default value at
 * write time would record a source the translation never saw, quietly passing
 * off a translation of superseded text as current. Anything it does not name
 * falls back to the default value as it now stands.
 */
async function resolveSourceHashes(
	keys: string[],
	translatedFrom?: Record<string, string>,
): Promise<Map<string, string | null>> {
	// `hasOwn`, not a truthiness check: a key named after something on
	// Object.prototype would otherwise read as present and hash a function.
	const unknown = translatedFrom
		? keys.filter(key => !Object.hasOwn(translatedFrom, key))
		: keys;

	const hashes =
		unknown.length > 0
			? await getSourceHashes(unknown)
			: new Map<string, string | null>();

	for (const [key, sourceValue] of Object.entries(translatedFrom ?? {})) {
		hashes.set(key, hashValue(sourceValue));
	}

	return hashes;
}

/**
 * Create a key and give every locale an empty value for it.
 *
 * One batch rather than a write per locale, because a write per locale reads
 * the default row's source hash while a sibling write is still creating it.
 * Nothing is hashed here: an empty translation answers nothing, and the first
 * real edit records what it was written against.
 */
export async function createTranslationKey(
	key: string,
	locales: string[],
	section?: string,
): Promise<void> {
	const statements = [
		db
			.insert(translationKeys)
			.values({ key, section: section ?? null })
			// The key row can outlive its translations — a rollback leaves one
			// behind for anything added since the release — so honour the section
			// the editor just picked rather than whichever one it used to have.
			.onConflictDoUpdate({
				target: [translationKeys.key],
				set: { section: section ?? null },
			}),
		...locales.map(language =>
			db
				.insert(translations)
				.values({ key, language, value: '' })
				.onConflictDoNothing(),
		),
	];

	const [first, ...rest] = statements;
	await db.batch([first, ...rest]);
}

export async function bulkUpsertTranslations(
	language: string,
	translationsMap: Record<string, string>,
	options: {
		section?: string;
		/** The default-locale text each translation was made from, by key. */
		translatedFrom?: Record<string, string>;
	} = {},
) {
	const keys = Object.keys(translationsMap);
	if (keys.length === 0) return;

	const isDefaultLocale = language === (await getDefaultLocale());
	const sourceHashes = isDefaultLocale
		? new Map<string, string | null>()
		: await resolveSourceHashes(keys, options.translatedFrom);

	const translationValues = Object.entries(translationsMap).map(
		([key, value]) => ({
			key,
			language,
			value,
			sourceHash: isDefaultLocale
				? hashValue(value)
				: (sourceHashes.get(key) ?? null),
		}),
	);

	const keyValues = keys.map(key => ({
		key,
		section: options.section ?? null,
	}));

	// Bound parameters per row, against D1's cap of 100 per statement.
	const KEY_BATCH_SIZE = 45;
	const BATCH_SIZE = 20;

	// First, upsert all translation keys with their sections
	for (let i = 0; i < keyValues.length; i += KEY_BATCH_SIZE) {
		const batch = keyValues.slice(i, i + KEY_BATCH_SIZE);
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
					sourceHash: isDefaultLocale
						? rehashOnlyOnChange
						: sql`EXCLUDED.sourceHash`,
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

	// Chunked to stay under D1's cap of 100 bound parameters per statement, but
	// sent as one batch: D1 runs a batch in a transaction, so a failure part-way
	// through cannot leave a caller with half their keys deleted and no report
	// of which half.
	const BATCH_SIZE = 90;
	const statements = [];

	for (let i = 0; i < keys.length; i += BATCH_SIZE) {
		const batch = keys.slice(i, i + BATCH_SIZE);

		// Deleting the key cascades to its translations in every locale.
		statements.push(
			db.delete(translationKeys).where(inArray(translationKeys.key, batch)),
		);
	}

	const [first, ...rest] = statements;
	await db.batch([first, ...rest]);
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

/**
 * A translation as a release snapshots it.
 *
 * `section` is not a column on `translations` — it rides along so a rollback
 * can rebuild the `translation_keys` rows its translations depend on.
 */
export interface TranslationBackupRow {
	key: string;
	language: string;
	value: string;
	section: string | null;
	sourceHash: string | null;
}

export interface TranslationsBackup {
	formatVersion: 2;
	/** Named, not positional: the locale every `sourceHash` was recorded against. */
	defaultLocale: string;
	/** Every locale that existed, including any holding no translations. */
	locales: string[];
	translations: TranslationBackupRow[];
}

const backupRowSchema = z.object({
	key: z.string(),
	language: z.string().min(1),
	value: z.string(),
	section: z.string().nullish(),
	sourceHash: z.string().nullish(),
});

const translationsBackupSchema = z
	.object({
		formatVersion: z.literal(2),
		defaultLocale: z.string().min(1),
		locales: z.array(z.string().min(1)),
		translations: z.array(backupRowSchema),
	})
	.refine(backup => backup.locales.includes(backup.defaultLocale), {
		message: 'defaultLocale is not among locales',
	});

/**
 * Read a backup of either format into the one shape a restore needs.
 *
 * Releases before this format recorded the default locale only by putting it
 * first in an array of per-locale groups, which loses it entirely when the
 * default locale held no translations. `fallbackDefaultLocale` — what the CMS
 * considers default right now — is the best available guess in that case, and
 * is wrong only if the default locale both changed and was empty at release.
 */
export function normalizeTranslationsBackup(
	raw: unknown,
	{ fallbackDefaultLocale }: { fallbackDefaultLocale: string | null },
): { defaultLocale: string; locales: string[]; rows: TranslationBackupRow[] } {
	let defaultLocale: string;
	let locales: string[];
	let rows: TranslationBackupRow[];

	if (Array.isArray(raw)) {
		const groups = z.array(z.array(backupRowSchema)).parse(raw);
		const groupLocales = groups
			.filter(group => group.length > 0)
			.map(group => group[0].language);

		const recorded = groups[0]?.[0]?.language;
		const resolved = recorded ?? fallbackDefaultLocale ?? groupLocales[0];
		if (resolved == null) {
			throw new Error('Backup holds no translations and no default locale');
		}

		defaultLocale = resolved;
		locales = groupLocales;
		rows = groups.flat().map(normalizeRow);
	} else {
		const backup = translationsBackupSchema.parse(raw);
		defaultLocale = backup.defaultLocale;
		locales = backup.locales;
		rows = backup.translations.map(normalizeRow);
	}

	// A row must never name a locale the restore would not create.
	const all = new Set([
		defaultLocale,
		...locales,
		...rows.map(r => r.language),
	]);

	return { defaultLocale, locales: [...all], rows };
}

function normalizeRow(
	row: z.infer<typeof backupRowSchema>,
): TranslationBackupRow {
	return {
		key: row.key,
		language: row.language,
		value: row.value,
		section: row.section ?? null,
		sourceHash: row.sourceHash ?? null,
	};
}

/** Rows must be uniform: the batch size is derived from the width of the first. */
async function insertInBatches<T extends Record<string, unknown>>(
	rows: T[],
	insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
	if (rows.length === 0) return;

	const batchSize = batchSizeForColumns(Object.keys(rows[0]).length);
	for (let i = 0; i < rows.length; i += batchSize) {
		await insert(rows.slice(i, i + batchSize));
	}
}

/** Replace translations and their source locale with a released snapshot. */
export async function restoreTranslationsFromBackup(
	raw: unknown,
	{ fallbackDefaultLocale }: { fallbackDefaultLocale: string | null },
): Promise<void> {
	const { defaultLocale, locales, rows } = normalizeTranslationsBackup(raw, {
		fallbackDefaultLocale,
	});

	await db.delete(translations);

	await insertInBatches(
		locales.map(locale => ({ locale, default: locale === defaultLocale })),
		batch => db.insert(languages).values(batch).onConflictDoNothing(),
	);
	await db
		.update(languages)
		.set({ default: false })
		.where(ne(languages.locale, defaultLocale));
	await db
		.update(languages)
		.set({ default: true })
		.where(eq(languages.locale, defaultLocale));

	// A key's section must exist before the key references it, and the key
	// before its translations. Both are restored additively — `sections` is
	// shared with media and block collections, and `translation_keys` with
	// block-owned keys, none of which a translation backup describes. So a
	// rollback adds back what the snapshot held without removing what it did
	// not: sections created since the release survive it.
	const keyedSections = new Map<string, string | null>();
	for (const row of rows) keyedSections.set(row.key, row.section);

	const sectionNames = [
		...new Set([...keyedSections.values()].filter(name => name != null)),
	];

	await insertInBatches(
		sectionNames.map(name => ({ name })),
		batch => db.insert(sections).values(batch).onConflictDoNothing(),
	);

	await insertInBatches(
		[...keyedSections].map(([key, section]) => ({ key, section })),
		batch =>
			db
				.insert(translationKeys)
				.values(batch)
				.onConflictDoUpdate({
					target: [translationKeys.key],
					set: { section: sql`EXCLUDED.section` },
				}),
	);

	await insertInBatches(
		rows.map(({ key, language, value, sourceHash }) => ({
			key,
			language,
			value,
			sourceHash,
		})),
		batch =>
			db
				.insert(translations)
				.values(batch)
				.onConflictDoUpdate({
					target: [translations.language, translations.key],
					set: {
						value: sql`EXCLUDED.value`,
						sourceHash: sql`EXCLUDED.sourceHash`,
					},
				}),
	);
}
