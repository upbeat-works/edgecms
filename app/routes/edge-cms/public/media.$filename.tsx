import { getMediaByFilename } from '~/lib/db.server';
import type { Route } from './+types/media.$filename';
import { env } from 'cloudflare:workers';
import { buildVersionedFilename } from '~/lib/media.server';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': env.TRUSTED_ORIGINS || '*',
	'Access-Control-Allow-Methods': 'GET',
	'Access-Control-Max-Age': '86400', // 24 hours
};

export async function loader({ params, request }: Route.LoaderArgs) {
	if (request.method === 'OPTIONS') {
		return new Response(null, { headers: CORS_HEADERS });
	}

	const { filename } = params;
	const url = new URL(request.url);
	const version = url.searchParams.get('version');

	const media = await getMediaByFilename(
		filename,
		version != null ? parseInt(version) : undefined,
	);
	if (!media) {
		throw new Response('Not Found', { status: 404 });
	}

	const versionedFilename = buildVersionedFilename(
		media.filename,
		media.version,
	);
	// Get the R2 object
	const object = await env.MEDIA_BUCKET.get(versionedFilename);

	if (!object) {
		throw new Response('Not Found', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set(
		'Cache-Control',
		'public, max-age=172800, stale-while-revalidate=604800',
	); // 48 hour cache, 7 day stale
	headers.set('Accept-Ranges', 'bytes');
	// 48 hour cache in GMT
	headers.set('Expires', new Date(Date.now() + 172800 * 1000).toUTCString());
	Object.keys(CORS_HEADERS).forEach(key => {
		headers.set(key, CORS_HEADERS[key as keyof typeof CORS_HEADERS]);
	});

	return new Response(object.body, {
		headers,
	});
}
