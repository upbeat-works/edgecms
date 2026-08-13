import { getActiveLegalVariant } from '~/utils/db.server';
import { parseLegalReleasePayload } from '~/utils/legal-release.server';
import type { Route } from './+types/legal-document';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export async function loader({ params, request }: Route.LoaderArgs) {
	const active = await getActiveLegalVariant({
		slug: params.slug,
		locale: params.locale,
	});
	if (
		!active?.variant.releaseHash ||
		!active.variant.signature ||
		!active.variant.signingKeyId ||
		!active.variant.publicJwk ||
		!active.variant.pdfKey
	) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const etag = `"${active.variant.releaseHash}"`;
	if (request.headers.get('If-None-Match') === etag) {
		return new Response(null, {
			status: 304,
			headers: { 'Cache-Control': CACHE_CONTROL, ETag: etag },
		});
	}

	return Response.json(
		{
			document: {
				id: active.document.id,
				name: active.document.name,
				slug: active.document.slug,
				type: active.document.type,
			},
			release: {
				id: active.release.id,
				version: active.release.version,
				effectiveDate: active.release.effectiveDate,
				locale: active.variant.locale,
			},
			payload: parseLegalReleasePayload(active.variant.payload),
			canonicalPayload: active.variant.payload,
			releaseHash: active.variant.releaseHash,
			signature: active.variant.signature,
			signatureAlgorithm: 'ES256',
			signingKeyId: active.variant.signingKeyId,
			publicJwk: JSON.parse(active.variant.publicJwk) as JsonWebKey,
			pdfUrl: `/edge-cms/public/legal/${encodeURIComponent(active.document.slug)}/${encodeURIComponent(active.variant.locale)}.pdf`,
		},
		{
			headers: {
				'Cache-Control': CACHE_CONTROL,
				ETag: etag,
			},
		},
	);
}
