import { getLatestVersion } from '~/lib/db.server';
import type { Route } from './+types/i18n.$locale[.]json';
import { env } from 'cloudflare:workers';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': env.TRUSTED_ORIGINS || '*',
	'Access-Control-Allow-Methods': 'GET',
	'Access-Control-Max-Age': '86400', // 24 hours
};

export async function loader({ params, request }: Route.LoaderArgs) {
	if (request.method === 'OPTIONS') {
		return new Response(null, { headers: CORS_HEADERS });
	}

	const locale = params.locale;
	const url = new URL(request.url);
	const requestedVersion = url.searchParams.get('version');

	// Get live version to determine which files to serve
	const liveVersion = await getLatestVersion('live');
	if (!liveVersion && !requestedVersion) {
		return new Response('Version not found', { status: 404 });
	}

	const version = requestedVersion || liveVersion?.id;

	// Try to get from cache first
	const cacheKey = `translations:${locale}:${version}`;
	const cached = await env.CACHE.get(cacheKey);

	if (cached) {
		return new Response(cached, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600', // 1 hour browser cache
			},
		});
	}

	// Try to get translation file from R2
	const filename = `${version}/${locale}.json`;
	const translationFile = await env.BACKUPS_BUCKET.get(filename);

	if (!translationFile) {
		// Fallback to empty object if file doesn't exist
		return new Response('No translation file found', { status: 404 });
	}

	// Parse the JSON content
	const translations = await translationFile.json();

	// Cache the result
	const jsonResponse = JSON.stringify(translations);
	await env.CACHE.put(cacheKey, jsonResponse);

	return new Response(jsonResponse, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=1800', // 30min browser cache
			ETag: `${version}-${locale}`,
			...CORS_HEADERS,
		},
	});
}
