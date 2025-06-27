import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";

export function getDb(env: Env) {
  return drizzle(env.DB);
}

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
  uploadedAt: string;
}

// Language operations
export async function getLanguages(env: Env): Promise<Language[]> {
  const result = await env.DB.prepare("SELECT * FROM Languages ORDER BY locale").all();
  return result.results as unknown as Language[];
}

export async function createLanguage(env: Env, locale: string, isDefault: boolean = false) {
  // If setting as default, unset other defaults
  if (isDefault) {
    await env.DB.prepare("UPDATE Languages SET `default` = FALSE").run();
  }
  
  await env.DB.prepare(
    "INSERT INTO Languages (locale, `default`) VALUES (?, ?)"
  ).bind(locale, isDefault).run();
}

// Section operations
export async function getSections(env: Env): Promise<Section[]> {
  const result = await env.DB.prepare("SELECT * FROM Sections ORDER BY name").all();
  return result.results as unknown as Section[];
}

export async function createSection(env: Env, name: string) {
  await env.DB.prepare("INSERT INTO Sections (name) VALUES (?)").bind(name).run();
}

// Translation operations
export async function getTranslations(env: Env, section?: string): Promise<Translation[]> {
  let query = "SELECT * FROM Translations";
  if (section) {
    query += " WHERE section = ?";
  }
  query += " ORDER BY key, language";
  
  const stmt = env.DB.prepare(query);
  const result = section ? await stmt.bind(section).all() : await stmt.all();
  return result.results as unknown as Translation[];
}

export async function getTranslationsByLocale(env: Env, locale: string): Promise<Translation[]> {
  const result = await env.DB.prepare(
    "SELECT * FROM Translations WHERE language = ? ORDER BY key"
  ).bind(locale).all();
  return result.results as unknown as Translation[];
}

export async function upsertTranslation(
  env: Env,
  key: string,
  language: string,
  value: string,
  section?: string
) {
  await env.DB.prepare(
    `INSERT INTO Translations (key, language, value, section) 
     VALUES (?, ?, ?, ?)
     ON CONFLICT(language, key) 
     DO UPDATE SET value = excluded.value, section = excluded.section`
  ).bind(key, language, value, section || null).run();
  
  // Invalidate cache for this locale
  await env.CACHE.delete(`translations:${language}`);
}

// Media operations
export async function getMedia(env: Env, section?: string): Promise<Media[]> {
  let query = "SELECT * FROM Media";
  if (section) {
    query += " WHERE section = ?";
  }
  query += " ORDER BY uploadedAt DESC";
  
  const stmt = env.DB.prepare(query);
  const result = section ? await stmt.bind(section).all() : await stmt.all();
  return result.results as unknown as Media[];
}

export async function createMedia(
  env: Env,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  section?: string
) {
  await env.DB.prepare(
    `INSERT INTO Media (filename, mimeType, sizeBytes, section) 
     VALUES (?, ?, ?, ?)`
  ).bind(filename, mimeType, sizeBytes, section || null).run();
}

export async function updateMediaSection(env: Env, mediaId: number, section: string | null) {
  await env.DB.prepare(
    "UPDATE Media SET section = ? WHERE id = ?"
  ).bind(section, mediaId).run();
}

// Helper to get translations with fallback to default language
export async function getTranslationsWithFallback(env: Env, locale: string): Promise<Record<string, string>> {
  // Get default language
  const defaultLangResult = await env.DB.prepare(
    "SELECT locale FROM Languages WHERE `default` = TRUE LIMIT 1"
  ).first();
  const defaultLocale = defaultLangResult?.locale as string || 'en';
  
  // Get all translations for the requested locale and default locale
  const result = await env.DB.prepare(
    `SELECT DISTINCT 
       t1.key,
       COALESCE(t1.value, t2.value) as value
     FROM (
       SELECT key FROM Translations
     ) keys
     LEFT JOIN Translations t1 ON keys.key = t1.key AND t1.language = ?
     LEFT JOIN Translations t2 ON keys.key = t2.key AND t2.language = ?
     WHERE t1.value IS NOT NULL OR t2.value IS NOT NULL`
  ).bind(locale, defaultLocale).all();
  
  const translations: Record<string, string> = {};
  for (const row of result.results) {
    translations[row.key as string] = row.value as string;
  }
  
  return translations;
} 