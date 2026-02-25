import { getLatestVersion } from '~/utils/db.server';
import type { Route } from './+types/i18n.$locale[.]json';
import { env } from 'cloudflare:workers';

const CACHE_HEADERS = {
	'Content-Type': 'application/json',
	// Short browser cache, then serve stale while revalidating in the background
	'Cache-Control': 'public, max-age=180, stale-while-revalidate=604800',
} as const;

export async function loader({ params, request }: Route.LoaderArgs) {
	const locale = params.locale;
	const url = new URL(request.url);
	const requestedVersion = url.searchParams.get('version');

	// Get live version to determine which files to serve
	const liveVersion = await getLatestVersion('live');
	if (!liveVersion && !requestedVersion) {
		return new Response('Version not found', { status: 404 });
	}

	const version = requestedVersion || liveVersion?.id;
	const etag = `${version}-${locale}`;

	// Return 304 if the client already has the current version
	if (request.headers.get('If-None-Match') === etag) {
		return new Response(null, {
			status: 304,
			headers: { ...CACHE_HEADERS, ETag: etag },
		});
	}

	// Try to get from cache first
	const cacheKey = `translations:${locale}:${version}`;
	const cached = await env.CACHE.get(cacheKey);

	if (cached) {
		return new Response(cached, {
			headers: { ...CACHE_HEADERS, ETag: etag },
		});
	}

	// Try to get translation file from R2
	const filename = `${version}/${locale}.json`;
	const translationFile = await env.BACKUPS_BUCKET.get(filename);

	if (!translationFile) {
		return new Response('No translation file found', { status: 404 });
	}

	// Parse the JSON content
	const translations = await translationFile.json();

	// Cache the result
	const jsonResponse = JSON.stringify(translations);
	await env.CACHE.put(cacheKey, jsonResponse, {
		expirationTtl: 60 * 60 * 24 * 90, // 90 days
	});

	return new Response(jsonResponse, {
		headers: { ...CACHE_HEADERS, ETag: etag },
	});
}
