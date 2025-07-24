import { drizzle } from "drizzle-orm/d1";
import { eq, desc, count, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { languages, sections, translations, media, versions } from "./schema.server";

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
  const result = await db.select().from(versions).orderBy(desc(versions.id));
  return result.map(row => ({
    id: row.id,
    description: row.description,
    status: row.status || 'draft',
    createdAt: new Date(row.createdAt),
    createdBy: row.createdBy
  }));
}

export async function getLiveVersion(): Promise<Version | null> {
  const result = await db.select().from(versions).where(eq(versions.status, 'live')).limit(1);
  if (result.length === 0) return null;
  
  const row = result[0];
  return {
    id: row.id,
    description: row.description,
    status: row.status || 'live',
    createdAt: new Date(row.createdAt),
    createdBy: row.createdBy || null
  };
}

export async function getLatestVersion(): Promise<Version | null> {
  const result = await db.select().from(versions).orderBy(desc(versions.id)).limit(1);
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
  
  // Invalidate all translation caches since live version changed
  const allLanguages = await getLanguages();
  for (const lang of allLanguages) {
    await env.CACHE.delete(`translations:${lang.locale}`);
  }
}

// File generation for production
export async function generateTranslationFiles(): Promise<void> {
  const liveVersion = await getLiveVersion();
  if (!liveVersion) {
    throw new Error("No live version found");
  }
  
  const languages = await getLanguages();
  
  for (const language of languages) {
    const translations = await getTranslationsByLocale(language.locale);
    
    // Convert to key-value format
    const translationMap: Record<string, string> = {};
    for (const translation of translations) {
      translationMap[translation.key] = translation.value;
    }
    
    // Store in R2 bucket as JSON file
    const filename = `i18n/${language.locale}.json`;
    const content = JSON.stringify(translationMap, null, 2);
    
    await env.MEDIA_BUCKET.put(filename, content, {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600' // Cache for 1 hour
      }
    });
  }
}

export async function releaseDraft(): Promise<void> {
  // 1. Create new version from current draft
  const latestVersion = await getLatestVersion();
  if (!latestVersion || latestVersion.status !== 'draft') {
    throw new Error("No draft version found");
  }
  
  // 2. Generate translation files from current database state
  await generateTranslationFiles();
  
  // 3. Promote the draft to live
  await promoteVersion(latestVersion.id);
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
  
  // Invalidate cache for this locale
  await env.CACHE.delete(`translations:${language}`);
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

// Helper to get translations with fallback to default language
export async function getTranslationsWithFallback(locale: string): Promise<Record<string, string>> {
  // Get default language
  const defaultLangResult = await db.select({ locale: languages.locale })
    .from(languages)
    .where(eq(languages.default, true))
    .limit(1);
  const defaultLocale = defaultLangResult[0]?.locale;
  
  // Get all unique keys first
  const allKeys = await db.selectDistinct({ key: translations.key }).from(translations);
  
  // Get translations for both locales
  const [requestedTranslations, defaultTranslations] = await Promise.all([
    db.select().from(translations).where(eq(translations.language, locale)),
    db.select().from(translations).where(eq(translations.language, defaultLocale))
  ]);
  
  // Create lookup maps
  const requestedMap = new Map(requestedTranslations.map(t => [t.key, t.value]));
  const defaultMap = new Map(defaultTranslations.map(t => [t.key, t.value]));
  
  // Build final result with fallback logic
  const result: Record<string, string> = {};
  for (const { key } of allKeys) {
    const value = requestedMap.get(key) || defaultMap.get(key);
    if (value) {
      result[key] = value;
    }
  }
  
  return result;
} 