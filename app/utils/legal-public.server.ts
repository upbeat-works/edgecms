import { env } from 'cloudflare:workers';
import {
	getActiveLegalVariant,
	getLegalVariantByReleaseHash,
} from './db.server';
import {
	createLegalConsentSnapshot,
	ensureActiveLegalConsentPolicy,
} from './legal-consent.server';
import { parseLegalReleasePayload } from './legal-release.server';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const IMMUTABLE_CACHE_CONTROL = 'public, immutable, max-age=31536000';
const CONSENT_CAPABILITY_CACHE_CONTROL = 'private, no-store';

async function getPublication(input: {
	slug: string;
	locale: string;
	releaseHash?: string;
}) {
	if (input.releaseHash) {
		return getLegalVariantByReleaseHash({
			slug: input.slug,
			locale: input.locale,
			releaseHash: input.releaseHash,
		});
	}
	return getActiveLegalVariant({
		slug: input.slug,
		locale: input.locale,
	});
}

function cacheControl(releaseHash?: string): string {
	if (releaseHash) return IMMUTABLE_CACHE_CONTROL;
	return CACHE_CONTROL;
}

export async function getLegalDocumentEvidence(input: {
	runtimeEnv: Env;
	slug: string;
	locale: string;
	releaseHash?: string;
}) {
	const publication = await getPublication(input);
	if (
		!publication?.variant.releaseHash ||
		!publication.variant.signature ||
		!publication.variant.signingKeyId ||
		!publication.variant.publicJwk ||
		!publication.variant.pdfKey
	) {
		return null;
	}

	const immutableBaseUrl = `/edge-cms/public/legal/${encodeURIComponent(publication.document.slug)}/${encodeURIComponent(publication.variant.locale)}/releases/${publication.variant.releaseHash}`;
	let consent;
	if (!input.releaseHash) {
		const consentRelease = {
			releaseId: publication.release.id,
			type: publication.document.type,
			slug: publication.document.slug,
			locale: publication.variant.locale,
			version: publication.release.version,
			effectiveDate: publication.release.effectiveDate,
			releaseHash: publication.variant.releaseHash,
		};
		await ensureActiveLegalConsentPolicy(input.runtimeEnv, consentRelease);
		consent = await createLegalConsentSnapshot(
			input.runtimeEnv,
			consentRelease,
		);
	}

	return {
		document: {
			id: publication.document.id,
			name: publication.document.name,
			slug: publication.document.slug,
			type: publication.document.type,
		},
		release: {
			id: publication.release.id,
			version: publication.release.version,
			effectiveDate: publication.release.effectiveDate,
			locale: publication.variant.locale,
		},
		payload: parseLegalReleasePayload(publication.variant.payload),
		canonicalPayload: publication.variant.payload,
		releaseHash: publication.variant.releaseHash,
		signature: publication.variant.signature,
		signatureAlgorithm: 'ES256' as const,
		signingKeyId: publication.variant.signingKeyId,
		publicJwk: JSON.parse(publication.variant.publicJwk) as JsonWebKey,
		evidenceUrl: immutableBaseUrl,
		markdownUrl: `${immutableBaseUrl}.md`,
		pdfUrl: `${immutableBaseUrl}.pdf`,
		consent,
	};
}

export async function legalDocumentResponse(input: {
	slug: string;
	locale: string;
	releaseHash?: string;
	request: Request;
}) {
	const document = await getLegalDocumentEvidence({
		...input,
		runtimeEnv: env,
	});
	if (!document) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const etag = `"${document.releaseHash}"`;
	const responseCacheControl = input.releaseHash
		? IMMUTABLE_CACHE_CONTROL
		: CONSENT_CAPABILITY_CACHE_CONTROL;
	if (
		input.releaseHash &&
		input.request.headers.get('If-None-Match') === etag
	) {
		return new Response(null, {
			status: 304,
			headers: { 'Cache-Control': responseCacheControl, ETag: etag },
		});
	}
	return Response.json(document, {
		headers: {
			'Cache-Control': responseCacheControl,
			ETag: etag,
		},
	});
}

export async function legalDocumentMarkdownResponse(input: {
	slug: string;
	locale: string;
	releaseHash?: string;
	request: Request;
}) {
	const publication = await getPublication(input);
	if (!publication?.variant.releaseHash || !publication.variant.signature) {
		return new Response('Legal document not found', { status: 404 });
	}

	const etag = `"${publication.variant.releaseHash}"`;
	const responseCacheControl = cacheControl(input.releaseHash);
	const headers = new Headers({
		'Cache-Control': responseCacheControl,
		'Content-Language': publication.variant.locale,
		'Content-Type': 'text/markdown; charset=utf-8',
		ETag: etag,
		'X-Content-Type-Options': 'nosniff',
	});
	if (input.request.headers.get('If-None-Match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	const payload = parseLegalReleasePayload(publication.variant.payload);
	headers.set(
		'Content-Disposition',
		`inline; filename="${publication.document.slug}-${publication.release.version}-${publication.variant.locale}.md"`,
	);
	return new Response(payload.markdown, { headers });
}

export async function legalDocumentPdfResponse(input: {
	slug: string;
	locale: string;
	releaseHash?: string;
	request: Request;
}) {
	const publication = await getPublication(input);
	if (!publication?.variant.pdfKey || !publication.variant.releaseHash) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const etag = `"${publication.variant.releaseHash}"`;
	const responseCacheControl = cacheControl(input.releaseHash);
	if (input.request.headers.get('If-None-Match') === etag) {
		return new Response(null, {
			status: 304,
			headers: {
				'Cache-Control': responseCacheControl,
				ETag: etag,
			},
		});
	}

	const object = await env.MEDIA_BUCKET.get(publication.variant.pdfKey);
	if (!object) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Content-Type', 'application/pdf');
	headers.set('Cache-Control', responseCacheControl);
	headers.set('ETag', etag);
	headers.set(
		'Content-Disposition',
		`inline; filename="${publication.document.slug}-${publication.release.version}-${publication.variant.locale}.pdf"`,
	);

	return new Response(object.body, { headers });
}
