import { getLiveMediaByFilename, getMediaByFilename } from '~/utils/db.server';
import type { Route } from './+types/media.$filename';
import { mediaRevisionUrl } from '~/utils/services/media.server';

export async function loader({ params, request }: Route.LoaderArgs) {
	const { filename } = params;
	const url = new URL(request.url);
	const version = url.searchParams.get('version');

	const media =
		version == null
			? await getLiveMediaByFilename(filename)
			: await getMediaByFilename(filename, Number(version));
	if (!media) {
		throw new Response('Not Found', {
			status: 404,
			headers: {
				'Cache-Control': 'no-store',
				'Cloudflare-CDN-Cache-Control': 'no-store',
			},
		});
	}

	return new Response(null, {
		status: 302,
		headers: {
			'Cache-Control': 'no-store',
			'Cloudflare-CDN-Cache-Control': 'no-store',
			Location: mediaRevisionUrl(request, media),
		},
	});
}
