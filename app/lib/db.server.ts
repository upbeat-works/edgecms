import { drizzle } from "drizzle-orm/d1";
import { eq, desc, count, sql, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { languages, sections, translations, media, versions, user } from "./schema.server";

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
  uploadedAt: Date;
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
  const result = await db.select().from(versions)
  .leftJoin(user, eq(versions.createdBy, user.id))
  .orderBy(desc(versions.id));

  return result.map(row => ({
    id: row.versions.id,
    description: row.versions.description,
    status: row.versions.status || 'draft',
    createdAt: new Date(row.versions.createdAt),
    createdBy: row.user?.name || 'System'
  }));
}

export async function getLatestVersion(status?: 'draft' | 'live' | 'archived'): Promise<Version | null> {
  const result = await db.select().from(versions)
  .where(status != null ? eq(versions.status, status) : sql`1 = 1`)
  .orderBy(desc(versions.id)).limit(1);
  if (result.length === 0) return null;
  
  const row = result[0];
  return {
    id: row.id,
    description: row.description,
    status: row.status || 'draft',
    createdAt: new Date(row.createdAt),
    createdBy: row.createdBy || null
  };
}

export async function createVersion(description?: string, createdBy?: string): Promise<Version> {
  const result = await db.insert(versions).values({
    description: description || null,
    status: 'draft',
    createdBy: createdBy || null
  }).returning();
  
  const row = result[0];
  return {
    id: row.id,
    description: row.description,
    status: row.status || 'draft',
    createdAt: new Date(row.createdAt),
    createdBy: row.createdBy
  };
}

export async function promoteVersion(versionId: number): Promise<void> {
  // Archive current live version
  await db.update(versions).set({ status: 'archived' })
    .where(eq(versions.status, 'live'));
  
  // Promote target version to live
  await db.update(versions).set({ status: 'live' })
    .where(eq(versions.id, versionId));
}

export async function releaseDraft(): Promise<void> {  
  const instance = await env.RELEASE_VERSION_WORKFLOW.create({ params: {} });
  console.log('Created release version workflow: ', instance);
}

export async function rollbackVersion(versionId: number): Promise<void> {
  const instance = await env.ROLLBACK_VERSION_WORKFLOW.create({ params: { versionId } });
  console.log('Created rollback version workflow: ', instance);
}

// Language operations
export async function getLanguages(): Promise<Language[]> {
  const result = await db.select().from(languages).orderBy(languages.locale);
  return result.map(row => ({
    locale: row.locale,
    default: row.default || false
  }));
}

export async function createLanguage(locale: string) {
  const [{ count: languageCount }] = await db.select({ count: count() }).from(languages);

  await db.insert(languages).values({
    locale,
    default: languageCount === 0
  });
}

export async function setDefaultLanguage(locale: string) {
  await db.update(languages).set({ default: false })
  .where(eq(languages.default, true));

  await db.update(languages)
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
  await db.update(sections).set({ name: newName }).where(eq(sections.name, oldName));
}

export async function deleteSection(name: string) {
  // With SET NULL foreign keys, this will automatically set section to null in related tables
  await db.delete(sections).where(eq(sections.name, name));
}

export interface SectionWithCounts {
  name: string;
  mediaCount: number;
  translationCount: number;
}

export async function getSectionsWithCounts(): Promise<SectionWithCounts[]> {
  const allSections = await db.select().from(sections).orderBy(sections.name);
  
  const result: SectionWithCounts[] = [];

  const [noSectionMedia, noSectionTranslations] = await Promise.all([
    db.select({ count: count() }).from(media).where(isNull(media.section)),
    db.select({ count: count() }).from(translations).where(isNull(translations.section))
  ]);

  if (noSectionMedia[0]?.count > 0 || noSectionTranslations[0]?.count > 0) {
    result.push({
      name: '-',
      mediaCount: noSectionMedia[0]?.count || 0,
      translationCount: noSectionTranslations[0]?.count || 0,
    });
  }

  for (const section of allSections) {
    const [mediaCountResult, translationCountResult] = await Promise.all([
      db.select({ count: count() }).from(media).where(eq(media.section, section.name)),
      db.select({ count: count() }).from(translations).where(eq(translations.section, section.name))
    ]);
    
    result.push({
      name: section.name,
      mediaCount: mediaCountResult[0]?.count || 0,
      translationCount: translationCountResult[0]?.count || 0,
    });
  }
  
  return result;
}

// Translation operations
export async function getTranslations(section?: string): Promise<Translation[]> {
  if (section) {
    return await db.select()
      .from(translations)
      .where(eq(translations.section, section))
      .orderBy(translations.key, translations.language);
  }
  
  return await db.select()
    .from(translations)
    .orderBy(translations.key, translations.language);
}

export async function getTranslationsByLocale(locale: string): Promise<Translation[]> {
  const result = await db.select()
    .from(translations)
    .where(eq(translations.language, locale))
    .orderBy(translations.key);
  return result;
}

export async function upsertTranslation(
  key: string,
  language: string,
  value: string,
  section?: string
) {
  await db.insert(translations)
    .values({
      key,
      language,
      value,
      section: section || null
    })
    .onConflictDoUpdate({
      target: [translations.language, translations.key],
      set: {
        value,
        section: section || null
      }
    });
}

// Media operations
export async function getMedia(section?: string): Promise<Media[]> {
  let result;
  if (section) {
    result = await db.select()
      .from(media)
      .where(eq(media.section, section))
      .orderBy(desc(media.uploadedAt));
  } else {
    result = await db.select()
      .from(media)
      .orderBy(desc(media.uploadedAt));
  }
  
  return result.map(row => ({
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    section: row.section,
    uploadedAt: new Date(row.uploadedAt)
  }));
}

export async function createMedia(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  section?: string
) {
  await db.insert(media).values({
    filename,
    mimeType,
    sizeBytes,
    section: section || null
  });
}

export async function updateMediaSection(mediaId: number, section: string | null) {
  await db.update(media)
    .set({ section })
    .where(eq(media.id, mediaId));
} 