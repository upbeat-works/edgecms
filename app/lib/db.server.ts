import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, count, sql, isNull, and, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import {
	languages,
	sections,
	translations,
	media,
	versions,
	user,
} from './schema.server';

const db = drizzle(env.DB);

export interface Language {
	locale: string;
	default: boolean;
}

export interface Section {
	name: string;
}

export interface Translation {
	key: string;
	language: string;
	value: string;
	section: string | null;
}

export interface Media {
	id: number;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section: string | null;
	state: 'live' | 'archived';
	uploadedAt: Date;
	version: number;
}

export interface Version {
	id: number;
	description: string | null;
	status: 'draft' | 'live' | 'archived';
	createdAt: Date;
	createdBy: string | null;
}

// Version operations
export async function getVersions(): Promise<Version[]> {
	const result = await db
		.select()
		.from(versions)
		.leftJoin(user, eq(versions.createdBy, user.id))
		.orderBy(desc(versions.id));

	return result.map(row => ({
		id: row.versions.id,
		description: row.versions.description,
		status: row.versions.status || 'draft',
		createdAt: new Date(row.versions.createdAt),
		createdBy: row.user?.name || 'System',
	}));
}

export async function getLatestVersion(
	status?: 'draft' | 'live' | 'archived',
): Promise<Version | null> {
	const result = await db
		.select()
		.from(versions)
		.where(status != null ? eq(versions.status, status) : sql`1 = 1`)
		.orderBy(desc(versions.id))
		.limit(1);
	if (result.length === 0) return null;

	const row = result[0];
	return {
		id: row.id,
		description: row.description,
		status: row.status || 'draft',
		createdAt: new Date(row.createdAt),
		createdBy: row.createdBy || null,
	};
}

export async function createVersion(
	description?: string,
	createdBy?: string,
): Promise<Version> {
	const result = await db
		.insert(versions)
		.values({
			description: description || null,
			status: 'draft',
			createdBy: createdBy || null,
		})
		.returning();

	const row = result[0];
	return {
		id: row.id,
		description: row.description,
		status: row.status || 'draft',
		createdAt: new Date(row.createdAt),
		createdBy: row.createdBy,
	};
}

export async function promoteVersion(versionId: number): Promise<void> {
	// Archive current live version
	await db
		.update(versions)
		.set({ status: 'archived' })
		.where(eq(versions.status, 'live'));

	// Promote target version to live
	await db
		.update(versions)
		.set({ status: 'live' })
		.where(eq(versions.id, versionId));
}

export async function releaseDraft(): Promise<void> {
	const instance = await env.RELEASE_VERSION_WORKFLOW.create({ params: {} });
	console.log('Created release version workflow: ', instance);
}

export async function rollbackVersion(versionId: number): Promise<void> {
	const instance = await env.ROLLBACK_VERSION_WORKFLOW.create({
		params: { versionId },
	});
	console.log('Created rollback version workflow: ', instance);
}

export async function runAITranslation(userId?: string): Promise<string> {
	const instance = await env.AI_TRANSLATE_WORKFLOW.create({
		params: { userId },
	});
	console.log('Created AI translate workflow: ', instance);
	return instance.id;
}

export async function getAITranslateInstance(
	instanceId: string,
): Promise<WorkflowInstance> {
	const instance = await env.AI_TRANSLATE_WORKFLOW.get(instanceId);
	console.log('AI translate workflow instance: ', instance);
	return instance;
}

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

// Section operations
export async function getSections(): Promise<Section[]> {
	const result = await db.select().from(sections).orderBy(sections.name);
	return result;
}

export async function createSection(name: string) {
	await db.insert(sections).values({ name });
}

export async function updateSection(oldName: string, newName: string) {
	// With CASCADE foreign keys, this will automatically update all references
	await db
		.update(sections)
		.set({ name: newName })
		.where(eq(sections.name, oldName));
}

export async function deleteSection(name: string) {
	// With SET NULL foreign keys, this will automatically set section to null in related tables
	await db.delete(sections).where(eq(sections.name, name));
}

export interface SectionWithCounts {
	name: string;
	mediaCount: number;
	translationCount: number;
	translationKeysCount: number;
}

export async function getSectionsWithCounts(): Promise<SectionWithCounts[]> {
	const allSections = await db.select().from(sections).orderBy(sections.name);

	const result: SectionWithCounts[] = [];

	const [noSectionMedia, noSectionTranslations, noSectionTranslationKeys] =
		await Promise.all([
			db.select({ count: count() }).from(media).where(isNull(media.section)),
			db
				.select({ count: count() })
				.from(translations)
				.where(isNull(translations.section)),
			db
				.select({ count: sql<number>`COUNT(DISTINCT key)` })
				.from(translations)
				.where(isNull(translations.section)),
		]);

	if (noSectionMedia[0]?.count > 0 || noSectionTranslations[0]?.count > 0) {
		result.push({
			name: '-',
			mediaCount: noSectionMedia[0]?.count || 0,
			translationCount: noSectionTranslations[0]?.count || 0,
			translationKeysCount: noSectionTranslationKeys[0]?.count || 0,
		});
	}

	for (const section of allSections) {
		const [mediaCountResult, translationCountResult, translationKeysResult] =
			await Promise.all([
				db
					.select({ count: count() })
					.from(media)
					.where(eq(media.section, section.name)),
				db
					.select({ count: count() })
					.from(translations)
					.where(eq(translations.section, section.name)),
				db
					.select({ count: sql<number>`COUNT(DISTINCT key)` })
					.from(translations)
					.where(eq(translations.section, section.name)),
			]);

		result.push({
			name: section.name,
			mediaCount: mediaCountResult[0]?.count || 0,
			translationCount: translationCountResult[0]?.count || 0,
			translationKeysCount: translationKeysResult[0]?.count || 0,
		});
	}

	return result;
}

// Translation operations
export async function getTranslations(
	section?: string,
): Promise<Translation[]> {
	if (section) {
		return await db
			.select()
			.from(translations)
			.where(eq(translations.section, section))
			.orderBy(translations.key, translations.language);
	}

	return await db
		.select()
		.from(translations)
		.orderBy(translations.key, translations.language);
}

export async function getTranslationsByLocale(
	locale: string,
): Promise<Translation[]> {
	const result = await db
		.select()
		.from(translations)
		.where(eq(translations.language, locale))
		.orderBy(translations.key);
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
			section: translations.section,
		})
		.from(translations)
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
	await db
		.insert(translations)
		.values({
			key,
			language,
			value,
			section: section || null,
		})
		.onConflictDoUpdate({
			target: [translations.language, translations.key],
			set: {
				value,
				section: section || null,
			},
		});
}

export async function bulkUpsertTranslations(
	language: string,
	translationsMap: Record<string, string>,
	section?: string,
) {
	const values = Object.entries(translationsMap).map(([key, value]) => ({
		key,
		language,
		value,
		section: section ?? null,
	}));

	if (values.length === 0) return;

	const BATCH_SIZE = 25;
	for (let i = 0; i < values.length; i += BATCH_SIZE) {
		const batch = values.slice(i, i + BATCH_SIZE);
		console.log(
			`Upserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(values.length / BATCH_SIZE)} for ${language}`,
		);
		await db
			.insert(translations)
			.values(batch)
			.onConflictDoUpdate({
				target: [translations.language, translations.key],
				set:
					section !== undefined
						? {
								value: sql`EXCLUDED.value`,
								section: sql`EXCLUDED.section`,
							}
						: {
								value: sql`EXCLUDED.value`,
							},
			});
	}
}

// Media operations
export async function getMedia(options?: {
	section?: string;
	state?: 'live' | 'archived';
	filename?: string;
}): Promise<Media[]> {
	const { section, state, filename } = options || {};

	const filters = [];
	if (section) filters.push(eq(media.section, section));
	if (state) filters.push(eq(media.state, state));
	if (filename) filters.push(eq(media.filename, filename));

	const result = await db
		.select()
		.from(media)
		.where(and(...filters))
		.orderBy(desc(media.uploadedAt));

	return result.map(row => ({
		...row,
		uploadedAt: new Date(row.uploadedAt),
	}));
}

export async function getLatestMediaVersions(options?: {
	section?: string;
	state?: 'live' | 'archived';
}): Promise<(Media & { count: number })[]> {
	const { state } = options || {};

	const bestVersions = db
		.select({
			filename: media.filename,
			count: sql<number>`COUNT(*)`.as('version_count'),
			bestVersion: sql<number>`
				COALESCE(
					MAX(CASE WHEN state = 'live' THEN version END),
					MAX(version)
				)
			`.as('best_version'),
		})
		.from(media)
		.groupBy(media.filename)
		.as('best_versions');

	const filters = [];
	if (state) filters.push(eq(media.state, state));

	const result = await db
		.select({
			media: media,
			count: bestVersions.count,
		})
		.from(media)
		.innerJoin(
			bestVersions,
			and(
				eq(media.filename, bestVersions.filename),
				eq(media.version, bestVersions.bestVersion),
			),
		)
		.where(and(...filters));

	return result.map(row => ({
		...row.media,
		uploadedAt: new Date(row.media.uploadedAt),
		count: row.count,
	}));
}

export async function createMedia(props: {
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section?: string;
	version?: number;
}) {
	const result = await db
		.insert(media)
		.values({
			filename: props.filename,
			mimeType: props.mimeType,
			sizeBytes: props.sizeBytes,
			section: props.section || null,
			version: props.version,
		})
		.returning();

	return result[0];
}

export async function updateMediaSection(
	mediaId: number,
	section: string | null,
) {
	await db.update(media).set({ section }).where(eq(media.id, mediaId));
}

export async function getMediaByFilename(
	filename: string,
	version?: number,
): Promise<Media | null> {
	const filters = [eq(media.filename, filename)];
	if (version) filters.push(eq(media.version, version));

	const result = await db
		.select()
		.from(media)
		.where(and(...filters))
		.orderBy(desc(media.version))
		.limit(1);
	if (result.length === 0) return null;

	return {
		...result[0],
		uploadedAt: new Date(result[0].uploadedAt),
	};
}

export async function getMediaById(mediaId: number): Promise<Media | null> {
	const result = await db.select().from(media).where(eq(media.id, mediaId));
	if (result.length === 0) return null;

	return {
		...result[0],
		uploadedAt: new Date(result[0].uploadedAt),
	};
}

export async function markMediaArchived(mediaId: number): Promise<void> {
	await db
		.update(media)
		.set({ state: 'archived' as any })
		.where(eq(media.id, mediaId));
}

export async function markMediaLive(mediaId: number): Promise<void> {
	const result = await db.select().from(media).where(eq(media.id, mediaId));
	if (result.length === 0) return;
	const archived = result[0];

	await db
		.update(media)
		.set({ state: 'archived' })
		.where(and(eq(media.filename, archived.filename), eq(media.state, 'live')));

	await db
		.update(media)
		.set({ state: 'live' as any })
		.where(eq(media.id, mediaId));
}

export async function deleteMediaByFilename(filename: string): Promise<void> {
	await db.delete(media).where(eq(media.filename, filename));
}

export async function deleteMediaById(mediaId: number): Promise<void> {
	const file = await getMediaById(mediaId);
	if (!file) return;
	await db.delete(media).where(eq(media.id, mediaId));

	if (file.state === 'live') {
		const latestVersion = await db
			.select()
			.from(media)
			.where(eq(media.filename, file.filename))
			.orderBy(desc(media.version))
			.limit(1);
		if (latestVersion.length > 0) {
			await db
				.update(media)
				.set({ state: 'live' })
				.where(eq(media.id, latestVersion[0].id));
		}
	}
}
