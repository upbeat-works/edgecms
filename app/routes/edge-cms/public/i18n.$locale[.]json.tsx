import { getTranslationsWithFallback } from "~/lib/db.server";
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
  
  // Get translations with fallback to default language
  const translations = await getTranslationsWithFallback(locale);
  
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