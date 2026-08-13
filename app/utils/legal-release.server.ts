import type { LegalDocumentType } from './db/types';

export interface LegalReleasePayload {
	documentId: number;
	slug: string;
	type: LegalDocumentType;
	locale: string;
	version: string;
	effectiveDate: string;
	markdown: string;
}

export interface SignedLegalRelease {
	releaseHash: string;
	signature: string;
	publicJwk: JsonWebKey;
}

export function parseLegalReleasePayload(value: string): LegalReleasePayload {
	const parsed: unknown = JSON.parse(value);
	if (parsed == null || typeof parsed !== 'object') {
		throw new Error('Legal release payload must be an object');
	}
	const fields = parsed as Record<string, unknown>;
	if (
		typeof fields.documentId !== 'number' ||
		typeof fields.slug !== 'string' ||
		typeof fields.type !== 'string' ||
		typeof fields.locale !== 'string' ||
		typeof fields.version !== 'string' ||
		typeof fields.effectiveDate !== 'string' ||
		typeof fields.markdown !== 'string'
	) {
		throw new Error('Legal release payload has invalid fields');
	}
	const supportedTypes: LegalDocumentType[] = [
		'terms_and_conditions',
		'privacy_policy',
		'cookie_policy',
		'dpa',
		'other',
	];
	if (!supportedTypes.includes(fields.type as LegalDocumentType)) {
		throw new Error('Legal release payload has an invalid document type');
	}
	return {
		documentId: fields.documentId,
		slug: fields.slug,
		type: fields.type as LegalDocumentType,
		locale: fields.locale,
		version: fields.version,
		effectiveDate: fields.effectiveDate,
		markdown: fields.markdown,
	};
}

export function parseLegalSigningPrivateJwk(value: string): JsonWebKey {
	const parsed: unknown = JSON.parse(value);
	if (parsed == null || typeof parsed !== 'object') {
		throw new Error('LEGAL_SIGNING_PRIVATE_JWK must be a JSON object');
	}
	const fields = parsed as Record<string, unknown>;
	if (
		fields.kty !== 'EC' ||
		fields.crv !== 'P-256' ||
		typeof fields.x !== 'string' ||
		typeof fields.y !== 'string' ||
		typeof fields.d !== 'string'
	) {
		throw new Error(
			'LEGAL_SIGNING_PRIVATE_JWK must be an EC P-256 private JWK',
		);
	}
	return {
		kty: 'EC',
		crv: 'P-256',
		x: fields.x,
		y: fields.y,
		d: fields.d,
		alg: 'ES256',
		key_ops: ['sign'],
		ext: true,
	};
}

export function serializeLegalReleasePayload(
	payload: LegalReleasePayload,
): string {
	return JSON.stringify({
		documentId: payload.documentId,
		slug: payload.slug,
		type: payload.type,
		locale: payload.locale,
		version: payload.version,
		effectiveDate: payload.effectiveDate,
		markdown: payload.markdown,
	});
}

function toBase64Url(bytes: ArrayBuffer): string {
	const characters = String.fromCharCode(...new Uint8Array(bytes));
	return btoa(characters)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export async function hashLegalReleasePayload(
	payload: string,
): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(payload),
	);
	return Array.from(new Uint8Array(digest), byte =>
		byte.toString(16).padStart(2, '0'),
	).join('');
}

export async function signLegalReleasePayload(
	payload: string,
	privateJwk: JsonWebKey,
): Promise<SignedLegalRelease> {
	const privateKey = await crypto.subtle.importKey(
		'jwk',
		privateJwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		privateKey,
		new TextEncoder().encode(payload),
	);
	const publicJwk: JsonWebKey = {
		kty: privateJwk.kty,
		crv: privateJwk.crv,
		x: privateJwk.x,
		y: privateJwk.y,
		alg: 'ES256',
		key_ops: ['verify'],
		ext: true,
	};
	return {
		releaseHash: await hashLegalReleasePayload(payload),
		signature: toBase64Url(signature),
		publicJwk,
	};
}

export async function verifyLegalReleaseSignature(
	payload: string,
	signature: string,
	publicJwk: JsonWebKey,
): Promise<boolean> {
	const publicKey = await crypto.subtle.importKey(
		'jwk',
		publicJwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify'],
	);
	return crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		publicKey,
		fromBase64Url(signature),
		new TextEncoder().encode(payload),
	);
}
