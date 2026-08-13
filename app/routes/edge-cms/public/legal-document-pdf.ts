import { env } from 'cloudflare:workers';
import { getActiveLegalVariant } from '~/utils/db.server';
import type { Route } from './+types/legal-document-pdf';

export async function loader({ params, request }: Route.LoaderArgs) {
	const active = await getActiveLegalVariant({
		slug: params.slug,
		locale: params.locale,
	});
	if (!active?.variant.pdfKey || !active.variant.releaseHash) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const etag = `"${active.variant.releaseHash}"`;
	if (request.headers.get('If-None-Match') === etag) {
		return new Response(null, {
			status: 304,
			headers: {
				'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
				ETag: etag,
			},
		});
	}

	const object = await env.MEDIA_BUCKET.get(active.variant.pdfKey);
	if (!object) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Content-Type', 'application/pdf');
	headers.set(
		'Cache-Control',
		'public, max-age=60, stale-while-revalidate=300',
	);
	headers.set('ETag', etag);
	headers.set(
		'Content-Disposition',
		`inline; filename="${active.document.slug}-${active.release.version}-${active.variant.locale}.pdf"`,
	);

	return new Response(object.body, { headers });
}
