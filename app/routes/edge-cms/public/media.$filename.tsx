import { getMediaByFilename } from '~/utils/db.server';
import type { Route } from './+types/media.$filename';
import { env } from 'cloudflare:workers';
import { buildVersionedFilename } from '~/utils/media.server';

export async function loader({ params, request }: Route.LoaderArgs) {
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
		// 1 month cache, 1 week stale
		'public, max-age=2592000, stale-while-revalidate=604800',
	); // 1 month cache, 1 week stale
	headers.set('Accept-Ranges', 'bytes');
	// 1 month cache in GMT
	headers.set('Expires', new Date(Date.now() + 2592000 * 1000).toUTCString());

	return new Response(object.body, {
		headers,
	});
}
