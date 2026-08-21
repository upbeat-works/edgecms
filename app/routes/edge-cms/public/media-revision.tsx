import { env } from 'cloudflare:workers';
import { getMediaById } from '~/utils/db.server';
import { buildVersionedFilename } from '~/utils/media.server';

export async function loader({
	params,
	request,
}: {
	params: { id: string; filename: string };
	request: Request;
}) {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) {
		return notFound();
	}

	const media = await getMediaById(id);
	if (!media) return notFound();

	const object = await env.MEDIA_BUCKET.get(
		buildVersionedFilename(media.filename, media.version),
	);
	if (!object) return notFound();

	const headers = new Headers({
		'Cache-Control': 'public, max-age=31536000, immutable',
		'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000, immutable',
	});
	object.writeHttpMetadata(headers);
	headers.set('Content-Type', media.mimeType);
	headers.set('ETag', object.httpEtag);

	const ifNoneMatch = request.headers.get('If-None-Match');
	const matches = ifNoneMatch
		?.split(',')
		.some(value => value.trim() === object.httpEtag || value.trim() === '*');
	if (matches) return new Response(null, { status: 304, headers });

	return new Response(object.body, { headers });
}

function notFound(): Response {
	return new Response('Not Found', {
		status: 404,
		headers: {
			'Cache-Control': 'no-store',
			'Cloudflare-CDN-Cache-Control': 'no-store',
		},
	});
}
