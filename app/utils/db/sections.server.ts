import { drizzle } from 'drizzle-orm/d1';
import { eq, count, inArray, isNull } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import {
	sections,
	media,
	translations,
	translationKeys,
} from '../schema.server';
import type { Section, SectionWithCounts } from './types';

const db = drizzle(env.DB);

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

export async function assignContentToSection(
	name: string,
	assignments: { translationKeys: string[]; mediaIds: number[] },
): Promise<void> {
	const D1_PARAMETER_CHUNK_SIZE = 90;
	const statements = [];

	for (
		let i = 0;
		i < assignments.translationKeys.length;
		i += D1_PARAMETER_CHUNK_SIZE
	) {
		const chunk = assignments.translationKeys.slice(
			i,
			i + D1_PARAMETER_CHUNK_SIZE,
		);
		statements.push(
			db
				.update(translationKeys)
				.set({ section: name })
				.where(inArray(translationKeys.key, chunk)),
		);
	}

	for (
		let i = 0;
		i < assignments.mediaIds.length;
		i += D1_PARAMETER_CHUNK_SIZE
	) {
		const chunk = assignments.mediaIds.slice(i, i + D1_PARAMETER_CHUNK_SIZE);
		statements.push(
			db.update(media).set({ section: name }).where(inArray(media.id, chunk)),
		);
	}

	if (statements.length === 0) return;
	const [first, ...rest] = statements;
	await db.batch([first, ...rest]);
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
				.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
				.where(isNull(translationKeys.section)),
			db
				.select({ count: count() })
				.from(translationKeys)
				.where(isNull(translationKeys.section)),
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
					.innerJoin(translationKeys, eq(translations.key, translationKeys.key))
					.where(eq(translationKeys.section, section.name)),
				db
					.select({ count: count() })
					.from(translationKeys)
					.where(eq(translationKeys.section, section.name)),
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
