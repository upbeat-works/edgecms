import { getLiveVersion } from "~/lib/db.server";
import type { Route } from "./+types/i18n.$locale[.]json";
import { env } from 'cloudflare:workers';

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale;
  
  // Try to get from cache first
  const cacheKey = `translations:${locale}`;
  const cached = await env.CACHE.get(cacheKey);
  
  if (cached) {
    return new Response(cached, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // 1 hour browser cache
      },
    });
  }
  
  // Get live version to determine which files to serve
  const liveVersion = await getLiveVersion();
  if (!liveVersion) {
    return new Response(JSON.stringify({}), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  
  // Try to get translation file from R2
  const filename = `i18n/${locale}.json`;
  const translationFile = await env.MEDIA_BUCKET.get(filename);
  
  if (!translationFile) {
    // Fallback to empty object if file doesn't exist
    return new Response(JSON.stringify({}), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  
  // Parse the JSON content
  const translations = await translationFile.json();
  
  // Cache the result
  const jsonResponse = JSON.stringify(translations);
  await env.CACHE.put(cacheKey, jsonResponse, {
    expirationTtl: 86400, // 24 hours
  });
  
  return new Response(jsonResponse, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // 1 hour browser cache
    },
  });
} 