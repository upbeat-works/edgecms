import { c15tInstance, type C15TInstance } from '@c15t/backend';
import { drizzleAdapter } from '@c15t/backend/db/adapters/drizzle';
import { postSubjectInputSchema } from '@c15t/schema';
import { drizzle } from 'drizzle-orm/d1';
import { safeParse } from 'valibot';
import * as c15tSchema from './c15t-schema.server';
import {
	getLegalDocumentById,
	getLegalReleaseById,
	getLegalReleaseVariants,
} from './db.server';
import type { LegalDocumentType } from './db/types';
import { parseLegalSigningPrivateJwk } from './legal-release.server';

const CONSENT_BASE_PATH = '/edge-cms/consent';
const SNAPSHOT_ISSUER = 'edgecms';
const SNAPSHOT_AUDIENCE = 'edgecms-legal-document-snapshot';
const SNAPSHOT_TTL_SECONDS = 15 * 60;
const MAX_CONSENT_REQUEST_BYTES = 64 * 1024;
type ConsentRequestAccess = 'public' | 'service';

export interface LegalConsentSnapshot {
	endpoint: string;
	type: string;
	documentSnapshotToken: string;
	expiresAt: string;
}

export interface RecordLegalConsentInput {
	type: string;
	documentSnapshotToken: string;
	subjectId: string;
	domain: string;
	ipAddress: string;
	userAgent: string;
	uiSource: string;
	externalSubjectId?: string;
	identityProvider?: string;
	metadata?: Record<string, LegalConsentMetadataValue>;
	givenAt?: number;
}

export interface IdentifyLegalConsentSubjectInput {
	subjectId: string;
	externalId: string;
	identityProvider?: string;
	ipAddress: string;
	userAgent: string;
}

export interface IdentifyLegalConsentSubjectResult {
	success: true;
	subject: {
		id: string;
		externalId: string;
	};
}

export type LegalConsentMetadataValue =
	| string
	| number
	| boolean
	| null
	| LegalConsentMetadataValue[]
	| { [key: string]: LegalConsentMetadataValue };

export interface LegalConsentReceipt {
	subjectId: string;
	consentId: string;
	domainId: string;
	domain: string;
	type: string;
	metadata?: Record<string, LegalConsentMetadataValue>;
	uiSource?: string;
	givenAt: string;
}

export interface LegalConsentDocumentRelease {
	releaseId: number;
	type: LegalDocumentType;
	slug: string;
	locale: string;
	version: string;
	effectiveDate: string;
	releaseHash: string;
}

interface LegalConsentRelease {
	releaseId: number;
	type: LegalDocumentType;
	slug: string;
	version: string;
	effectiveDate: string;
	documents: Array<{ locale: string; releaseHash: string }>;
}

interface LegalConsentSnapshotPayload {
	iss: string;
	aud: string;
	sub: string;
	type: string;
	version: string;
	hash: string;
	effectiveDate: string;
	iat: number;
	exp: number;
	releaseId: number;
	slug: string;
	locale: string;
	documentHash: string;
}

function consentTypePart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '_')
		.replace(/^_+|_+$/gu, '');
}

export function toConsentDocumentType(input: {
	type: LegalDocumentType;
	slug: string;
}): string {
	let family: 'terms_and_conditions' | 'privacy_policy' | 'dpa';
	if (input.type === 'privacy_policy' || input.type === 'cookie_policy') {
		family = 'privacy_policy';
	} else if (input.type === 'dpa') {
		family = 'dpa';
	} else {
		family = 'terms_and_conditions';
	}

	return [family, consentTypePart(input.slug)].join('_');
}

function base64Url(value: Uint8Array): string {
	return btoa(String.fromCharCode(...value))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
	const remainder = value.length % 4;
	if (remainder === 1) return null;
	const padding = remainder === 0 ? '' : '='.repeat(4 - remainder);
	try {
		const decoded = atob(
			`${value.replaceAll('-', '+').replaceAll('_', '/')}${padding}`,
		);
		return Uint8Array.from(decoded, character => character.charCodeAt(0));
	} catch {
		return null;
	}
}

function decodeTokenPart(value: string): Record<string, unknown> | null {
	const bytes = decodeBase64Url(value);
	if (!bytes) return null;
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
	);
}

function hex(value: Uint8Array): string {
	return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function compareDocumentLocale(
	left: { locale: string },
	right: { locale: string },
): number {
	if (left.locale < right.locale) return -1;
	if (left.locale > right.locale) return 1;
	return 0;
}

function consentReleaseHash(release: LegalConsentRelease): Promise<Uint8Array> {
	const documents = [...release.documents]
		.sort(compareDocumentLocale)
		.map(document => ({
			locale: document.locale,
			hash: document.releaseHash,
		}));
	return sha256(
		JSON.stringify({
			format: 'edgecms-legal-release-v1',
			type: toConsentDocumentType(release),
			slug: release.slug,
			version: release.version,
			effectiveDate: release.effectiveDate,
			documents,
		}),
	);
}

async function legalConsentSigningKey(runtimeEnv: Env): Promise<string> {
	const privateJwk = parseLegalSigningPrivateJwk(
		runtimeEnv.LEGAL_SIGNING_PRIVATE_JWK,
	);
	const keyMaterial = JSON.stringify({
		purpose: 'edgecms-legal-consent-snapshot-v1',
		kty: privateJwk.kty,
		crv: privateJwk.crv,
		x: privateJwk.x,
		y: privateJwk.y,
		d: privateJwk.d,
	});
	return base64Url(await sha256(keyMaterial));
}

function legalConsentSnapshotPayload(
	value: Record<string, unknown>,
): LegalConsentSnapshotPayload | null {
	const now = Math.floor(Date.now() / 1_000);
	if (
		value.iss !== SNAPSHOT_ISSUER ||
		value.aud !== SNAPSHOT_AUDIENCE ||
		typeof value.sub !== 'string' ||
		typeof value.type !== 'string' ||
		typeof value.version !== 'string' ||
		typeof value.hash !== 'string' ||
		value.sub !== value.hash ||
		typeof value.effectiveDate !== 'string' ||
		typeof value.iat !== 'number' ||
		typeof value.exp !== 'number' ||
		value.exp <= now ||
		typeof value.releaseId !== 'number' ||
		!Number.isInteger(value.releaseId) ||
		typeof value.slug !== 'string' ||
		typeof value.locale !== 'string' ||
		typeof value.documentHash !== 'string'
	) {
		return null;
	}
	return value as unknown as LegalConsentSnapshotPayload;
}

async function verifyLegalConsentSnapshot(
	runtimeEnv: Env,
	token: unknown,
): Promise<LegalConsentSnapshotPayload | null> {
	if (typeof token !== 'string') return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [protectedHeader, payload, encodedSignature] = parts;
	if (!protectedHeader || !payload || !encodedSignature) return null;
	const header = decodeTokenPart(protectedHeader);
	const decodedPayload = decodeTokenPart(payload);
	const signature = decodeBase64Url(encodedSignature);
	if (
		header?.alg !== 'HS256' ||
		header.typ !== 'JWT' ||
		!decodedPayload ||
		!signature
	) {
		return null;
	}
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await legalConsentSigningKey(runtimeEnv)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify'],
	);
	const valid = await crypto.subtle.verify(
		'HMAC',
		key,
		signature,
		new TextEncoder().encode(`${protectedHeader}.${payload}`),
	);
	if (!valid) return null;
	return legalConsentSnapshotPayload(decodedPayload);
}

function consentMetadata(
	metadata: unknown,
	snapshot: LegalConsentSnapshotPayload,
	givenAt: unknown,
	clientGivenAt?: unknown,
): Record<string, unknown> | null {
	if (metadata !== undefined) {
		if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
			return null;
		}
	}
	const evidence: Record<string, unknown> = {
		releaseId: snapshot.releaseId,
		slug: snapshot.slug,
		locale: snapshot.locale,
		documentHash: snapshot.documentHash,
		policyHash: snapshot.hash,
		givenAt,
	};
	if (typeof clientGivenAt === 'number' && Number.isFinite(clientGivenAt)) {
		evidence.clientGivenAt = clientGivenAt;
	}
	return {
		...(metadata as Record<string, unknown> | undefined),
		edgecmsLegalDocument: evidence,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeJsonBlob(value: unknown): Record<string, unknown> | null {
	let encoded: Uint8Array;
	if (Array.isArray(value)) {
		encoded = new Uint8Array(value);
	} else if (value instanceof ArrayBuffer) {
		encoded = new Uint8Array(value);
	} else if (ArrayBuffer.isView(value)) {
		encoded = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	} else if (typeof value === 'string') {
		encoded = new TextEncoder().encode(value);
	} else {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(encoded));
		if (!isRecord(parsed)) return null;
		if (isRecord(parsed.json)) return parsed.json;
		return parsed;
	} catch {
		return null;
	}
}

function snapshotEvidence(snapshot: LegalConsentSnapshotPayload) {
	return {
		releaseId: snapshot.releaseId,
		slug: snapshot.slug,
		locale: snapshot.locale,
		documentHash: snapshot.documentHash,
		policyHash: snapshot.hash,
	};
}

function hasSnapshotEvidence(
	metadata: Record<string, unknown>,
	snapshot: LegalConsentSnapshotPayload,
): boolean {
	const evidence = metadata.edgecmsLegalDocument;
	if (!isRecord(evidence)) return false;
	const expected = snapshotEvidence(snapshot);
	return (
		evidence.releaseId === expected.releaseId &&
		evidence.slug === expected.slug &&
		evidence.locale === expected.locale &&
		evidence.documentHash === expected.documentHash &&
		evidence.policyHash === expected.policyHash
	);
}

async function ensureCanonicalConsentIdentity(
	runtimeEnv: Env,
	input: {
		subjectId: string;
		domain: string;
		externalSubjectId?: string;
		identityProvider?: string;
	},
): Promise<void> {
	const domainId = `dom_${hex(
		await sha256(['default', input.domain].join('|')),
	)}`;
	let identityProvider = 'anonymous';
	if (input.externalSubjectId) {
		identityProvider = input.identityProvider ?? 'external';
	}
	await runtimeEnv.DB.batch([
		runtimeEnv.DB.prepare(
			`INSERT INTO c15t_subject (id, externalId, identityProvider)
			 VALUES (?, ?, ?)
			 ON CONFLICT(id) DO NOTHING`,
		).bind(input.subjectId, input.externalSubjectId ?? null, identityProvider),
		runtimeEnv.DB.prepare(
			`INSERT INTO c15t_domain (id, name)
			 SELECT ?, ?
			 WHERE NOT EXISTS (
				SELECT 1 FROM c15t_domain WHERE name = ? AND tenantId IS NULL
			 )
			 ON CONFLICT(id) DO NOTHING`,
		).bind(domainId, input.domain, input.domain),
	]);
}

interface StoredLegalConsent {
	id: string;
	subjectId: string;
	domainId: string;
	domain: string;
	metadata: Record<string, unknown>;
	givenAt: number;
}

async function storedLegalConsentForSubmission(
	runtimeEnv: Env,
	input: Record<string, unknown>,
	snapshot: LegalConsentSnapshotPayload,
): Promise<StoredLegalConsent | null> {
	if (
		typeof input.subjectId !== 'string' ||
		typeof input.domain !== 'string' ||
		typeof input.givenAt !== 'number' ||
		!Number.isFinite(input.givenAt)
	) {
		return null;
	}
	const policyId = await legalDocumentPolicyId(snapshot.type, snapshot.hash);
	const result = await runtimeEnv.DB.prepare(
		`SELECT consent.id, consent.subjectId, consent.domainId,
				domain.name AS domain, consent.metadata, consent.givenAt
		 FROM c15t_consent AS consent
		 JOIN c15t_domain AS domain ON domain.id = consent.domainId
		 WHERE consent.subjectId = ? AND domain.name = ?
		 AND consent.policyId = ?
		 ORDER BY consent.givenAt DESC
		 LIMIT 20`,
	)
		.bind(input.subjectId, input.domain, policyId)
		.all<{
			id: string;
			subjectId: string;
			domainId: string;
			domain: string;
			metadata: unknown;
			givenAt: number;
		}>();
	for (const row of result.results) {
		const metadata = decodeJsonBlob(row.metadata);
		if (!metadata) continue;
		const evidence = metadata.edgecmsLegalDocument;
		if (isRecord(evidence) && evidence.givenAt === input.givenAt) {
			return { ...row, metadata };
		}
	}
	return null;
}

function trustedOrigins(runtimeEnv: Env): string[] {
	return runtimeEnv.TRUSTED_ORIGINS.split(',')
		.map(origin => origin.trim())
		.filter(Boolean);
}

function consentErrorResponse(
	request: Request,
	runtimeEnv: Env,
	input: { code: string; message: string; status: number; allow?: string },
): Response {
	const headers = new Headers();
	if (input.allow) headers.set('Allow', input.allow);
	const origin = request.headers.get('Origin');
	if (origin && trustedOrigins(runtimeEnv).includes(origin)) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Vary', 'Origin');
	}
	return Response.json(
		{ code: input.code, message: input.message },
		{ status: input.status, headers },
	);
}

async function readConsentRequestBody(
	request: Request,
): Promise<string | null> {
	const contentLength = Number(request.headers.get('Content-Length'));
	if (
		Number.isFinite(contentLength) &&
		contentLength > MAX_CONSENT_REQUEST_BYTES
	) {
		return null;
	}
	if (!request.body) return '';
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		byteLength += chunk.value.byteLength;
		if (byteLength > MAX_CONSENT_REQUEST_BYTES) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(chunk.value);
	}
	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

async function enforcePublicConsentRateLimit(
	request: Request,
	runtimeEnv: Env,
): Promise<Response | null> {
	const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	const outcome = await runtimeEnv.LEGAL_CONSENT_RATE_LIMITER.limit({ key });
	if (outcome.success) return null;
	const response = consentErrorResponse(request, runtimeEnv, {
		code: 'LEGAL_CONSENT_RATE_LIMITED',
		message: 'Too many legal consent submissions',
		status: 429,
	});
	response.headers.set('Retry-After', '60');
	return response;
}

async function createConsentBackend(
	runtimeEnv: Env,
	context?: ExecutionContext,
): Promise<C15TInstance> {
	const db = drizzle(runtimeEnv.DB, { schema: c15tSchema });
	// D1 rejects the BEGIN emitted by Drizzle transactions. c15t still owns the
	// handler flow, but its transaction callbacks execute sequentially on D1.
	Object.defineProperty(db, 'transaction', {
		value: async <T>(transaction: (database: typeof db) => Promise<T>) =>
			transaction(db),
	});
	const signingKey = await legalConsentSigningKey(runtimeEnv);
	const background = context
		? { run: (task: () => Promise<void>) => context.waitUntil(task()) }
		: undefined;

	return c15tInstance({
		adapter: drizzleAdapter({ db, provider: 'sqlite' }),
		appName: 'EdgeCMS',
		basePath: CONSENT_BASE_PATH,
		branding: 'none',
		legalDocumentSnapshot: {
			signingKey,
			issuer: SNAPSHOT_ISSUER,
			audience: SNAPSHOT_AUDIENCE,
		},
		openapi: { enabled: false },
		tablePrefix: 'c15t_',
		trustedOrigins: trustedOrigins(runtimeEnv),
		background,
	});
}

async function handleConsentRequestWithAccess(
	request: Request,
	runtimeEnv: Env,
	context: ExecutionContext | undefined,
	access: ConsentRequestAccess,
): Promise<Response> {
	const url = new URL(request.url);
	const isSubjectsRoute = url.pathname === `${CONSENT_BASE_PATH}/subjects`;
	const isSubjectResourceRoute = new RegExp(
		`^${CONSENT_BASE_PATH}/subjects/[^/]+$`,
		'u',
	).test(url.pathname);
	const isStatusRoute = url.pathname === `${CONSENT_BASE_PATH}/status`;
	const isServiceSubjectPatch =
		access === 'service' &&
		request.method === 'PATCH' &&
		isSubjectResourceRoute;
	if (
		request.method !== 'GET' &&
		request.method !== 'POST' &&
		request.method !== 'OPTIONS' &&
		!isServiceSubjectPatch
	) {
		return consentErrorResponse(request, runtimeEnv, {
			code: 'METHOD_NOT_ALLOWED',
			message: 'This endpoint exposes legal consent reads and writes only',
			status: 405,
			allow: 'GET, POST, OPTIONS',
		});
	}
	if (request.method === 'POST' && !isSubjectsRoute) {
		return consentErrorResponse(request, runtimeEnv, {
			code: 'METHOD_NOT_ALLOWED',
			message: 'Legal consent writes use the subjects endpoint',
			status: 405,
			allow: 'GET, OPTIONS',
		});
	}
	if (
		(request.method === 'GET' && !isSubjectResourceRoute && !isStatusRoute) ||
		(request.method === 'OPTIONS' && !isSubjectsRoute)
	) {
		return consentErrorResponse(request, runtimeEnv, {
			code: 'LEGAL_CONSENT_ROUTE_NOT_FOUND',
			message: 'This c15t route is not exposed by EdgeCMS',
			status: 404,
		});
	}
	if (request.method === 'POST' && access === 'public') {
		const rateLimited = await enforcePublicConsentRateLimit(
			request,
			runtimeEnv,
		);
		if (rateLimited) return rateLimited;
	}
	let verifiedSnapshot: LegalConsentSnapshotPayload | null = null;
	let submittedConsent: Record<string, unknown> | null = null;
	if (request.method === 'POST') {
		let body: unknown;
		try {
			const bodyText = await readConsentRequestBody(request);
			if (bodyText === null) {
				return consentErrorResponse(request, runtimeEnv, {
					code: 'CONSENT_REQUEST_TOO_LARGE',
					message: 'Consent request body is too large',
					status: 413,
				});
			}
			body = JSON.parse(bodyText) as unknown;
		} catch {
			return consentErrorResponse(request, runtimeEnv, {
				code: 'INPUT_VALIDATION_FAILED',
				message: 'Request body must be valid JSON',
				status: 400,
			});
		}
		const type =
			body && typeof body === 'object' && 'type' in body
				? (body as { type?: unknown }).type
				: undefined;
		if (
			typeof type !== 'string' ||
			!/^(privacy_policy|dpa|terms_and_conditions)_[a-z0-9_]+$/u.test(type)
		) {
			return consentErrorResponse(request, runtimeEnv, {
				code: 'LEGAL_CONSENT_ONLY',
				message: 'This endpoint records EdgeCMS legal document consent only',
				status: 422,
			});
		}
		const receivedConsent = body as Record<string, unknown>;
		let consentBody = receivedConsent;
		let clientGivenAt: unknown;
		if (access === 'public') {
			clientGivenAt = receivedConsent.givenAt;
			consentBody = {
				type: receivedConsent.type,
				documentSnapshotToken: receivedConsent.documentSnapshotToken,
				subjectId: receivedConsent.subjectId,
				domain: receivedConsent.domain,
				metadata: receivedConsent.metadata,
				givenAt: Date.now(),
			};
		}
		submittedConsent = consentBody;
		verifiedSnapshot = await verifyLegalConsentSnapshot(
			runtimeEnv,
			consentBody.documentSnapshotToken,
		);
		let forwardedBody = consentBody;
		const validatedConsent = safeParse(postSubjectInputSchema, consentBody);
		if (verifiedSnapshot?.type === type && validatedConsent.success) {
			await ensureCanonicalConsentIdentity(runtimeEnv, validatedConsent.output);
			const metadata = consentMetadata(
				consentBody.metadata,
				verifiedSnapshot,
				consentBody.givenAt,
				clientGivenAt,
			);
			if (metadata) {
				forwardedBody = { ...consentBody, metadata };
			}
		}
		const headers = new Headers(request.headers);
		headers.delete('Content-Length');
		request = new Request(request, {
			headers,
			body: JSON.stringify(forwardedBody),
		});
	}
	const response = await (
		await createConsentBackend(runtimeEnv, context)
	).handler(request);
	if (
		request.method === 'POST' &&
		response.status >= 500 &&
		verifiedSnapshot &&
		submittedConsent
	) {
		const stored = await storedLegalConsentForSubmission(
			runtimeEnv,
			submittedConsent,
			verifiedSnapshot,
		);
		if (stored) {
			if (!hasSnapshotEvidence(stored.metadata, verifiedSnapshot)) {
				return consentErrorResponse(request, runtimeEnv, {
					code: 'LEGAL_CONSENT_EVIDENCE_CONFLICT',
					message:
						'Consent receipt identity already has different legal evidence',
					status: 409,
				});
			}
			return Response.json(
				{
					subjectId: stored.subjectId,
					consentId: stored.id,
					domainId: stored.domainId,
					domain: stored.domain,
					type: verifiedSnapshot.type,
					metadata: stored.metadata,
					givenAt: new Date(stored.givenAt * 1_000).toISOString(),
				},
				{ headers: response.headers },
			);
		}
	}
	if (request.method === 'POST' && response.ok && verifiedSnapshot) {
		const value = await responseObject(response.clone());
		const consentId = value.consentId;
		if (typeof consentId !== 'string') return response;
		const stored = await runtimeEnv.DB.prepare(
			'SELECT metadata FROM c15t_consent WHERE id = ?',
		)
			.bind(consentId)
			.first<{ metadata: unknown }>();
		const metadata = decodeJsonBlob(stored?.metadata);
		if (!metadata || !hasSnapshotEvidence(metadata, verifiedSnapshot)) {
			return consentErrorResponse(request, runtimeEnv, {
				code: 'LEGAL_CONSENT_EVIDENCE_CONFLICT',
				message:
					'Consent receipt identity already has different legal evidence',
				status: 409,
			});
		}
		return Response.json(
			{ ...value, metadata },
			{ status: response.status, headers: response.headers },
		);
	}
	if (request.method === 'GET' && isSubjectResourceRoute && response.ok) {
		const value = await responseObject(response.clone());
		if (isRecord(value.subject)) {
			const subject = { ...value.subject };
			delete subject.externalId;
			return Response.json(
				{ ...value, subject },
				{ status: response.status, headers: response.headers },
			);
		}
	}
	return response;
}

export function handleConsentRequest(
	request: Request,
	runtimeEnv: Env,
	context?: ExecutionContext,
): Promise<Response> {
	return handleConsentRequestWithAccess(request, runtimeEnv, context, 'public');
}

export async function createLegalConsentSnapshot(
	runtimeEnv: Env,
	release: LegalConsentDocumentRelease,
): Promise<LegalConsentSnapshot> {
	const issuedAt = Math.floor(Date.now() / 1_000);
	const expiresAt = issuedAt + SNAPSHOT_TTL_SECONDS;
	const consentRelease = await legalConsentReleaseForDocument(release);
	const type = toConsentDocumentType(consentRelease);
	const policyHash = hex(await consentReleaseHash(consentRelease));
	const protectedHeader = base64Url(
		new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
	);
	const snapshotPayload: LegalConsentSnapshotPayload = {
		iss: SNAPSHOT_ISSUER,
		aud: SNAPSHOT_AUDIENCE,
		sub: policyHash,
		type,
		version: release.version,
		hash: policyHash,
		effectiveDate: new Date(
			`${release.effectiveDate}T00:00:00.000Z`,
		).toISOString(),
		iat: issuedAt,
		exp: expiresAt,
		releaseId: release.releaseId,
		slug: release.slug,
		locale: release.locale,
		documentHash: release.releaseHash,
	};
	const payload = base64Url(
		new TextEncoder().encode(JSON.stringify(snapshotPayload)),
	);
	const unsignedToken = `${protectedHeader}.${payload}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await legalConsentSigningKey(runtimeEnv)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(unsignedToken),
	);

	return {
		endpoint: `${CONSENT_BASE_PATH}/subjects`,
		type,
		documentSnapshotToken: `${unsignedToken}.${base64Url(new Uint8Array(signature))}`,
		expiresAt: new Date(expiresAt * 1_000).toISOString(),
	};
}

async function legalDocumentPolicyId(
	type: string,
	policyHash: string,
): Promise<string> {
	const digest = await sha256(['default', type, policyHash].join('|'));
	return `pol_${hex(digest)}`;
}

interface LegalConsentPolicy {
	id: string;
	type: string;
	version: string;
	hash: string;
	effectiveDateSeconds: number;
	releaseId: number;
}

async function legalConsentPolicy(
	runtimeEnv: Env,
	release: LegalConsentRelease,
): Promise<LegalConsentPolicy> {
	const type = toConsentDocumentType(release);
	const policyHash = hex(await consentReleaseHash(release));
	const id = await legalDocumentPolicyId(type, policyHash);
	const effectiveDateSeconds = Math.floor(
		new Date(`${release.effectiveDate}T00:00:00.000Z`).getTime() / 1_000,
	);
	const existing = await runtimeEnv.DB.prepare(
		'SELECT version, hash, effectiveDate FROM c15t_consentPolicy WHERE id = ?',
	)
		.bind(id)
		.first<{ version: string; hash: string; effectiveDate: number }>();
	if (
		existing &&
		(existing.version !== release.version ||
			existing.hash !== policyHash ||
			existing.effectiveDate !== effectiveDateSeconds)
	) {
		const error = new Error(
			'Release metadata conflicts with existing consent policy',
		);
		error.name = 'LEGAL_DOCUMENT_RELEASE_CONFLICT';
		throw error;
	}

	return {
		id,
		type,
		version: release.version,
		hash: policyHash,
		effectiveDateSeconds,
		releaseId: release.releaseId,
	};
}

// c15t's /legal-documents/:type/current relies on a transaction callback. D1
// only makes multi-statement writes atomic through batch(), so the same policy
// writes stay inside the EdgeCMS release-transition batch.
function consentPolicyStatements(
	runtimeEnv: Env,
	policy: LegalConsentPolicy,
): D1PreparedStatement[] {
	return [
		runtimeEnv.DB.prepare(
			`UPDATE c15t_consentPolicy
			 SET isActive = 0
			 WHERE type = ? AND id != ?
			 AND EXISTS (
				SELECT 1 FROM legal_releases
				WHERE id = ? AND status IN ('processing', 'published')
			 )`,
		).bind(policy.type, policy.id, policy.releaseId),
		runtimeEnv.DB.prepare(
			`INSERT INTO c15t_consentPolicy
			 (id, version, type, hash, effectiveDate, isActive, createdAt)
			 SELECT ?, ?, ?, ?, ?, 1, unixepoch()
			 WHERE EXISTS (
				SELECT 1 FROM legal_releases
				WHERE id = ? AND status IN ('processing', 'published')
			 )
			 ON CONFLICT(id) DO UPDATE SET isActive = 1`,
		).bind(
			policy.id,
			policy.version,
			policy.type,
			policy.hash,
			policy.effectiveDateSeconds,
			policy.releaseId,
		),
	];
}

function activeReleaseConsentPolicyStatements(
	runtimeEnv: Env,
	policy: LegalConsentPolicy,
): D1PreparedStatement[] {
	return [
		runtimeEnv.DB.prepare(
			`UPDATE c15t_consentPolicy
			 SET isActive = 0
			 WHERE type = ? AND id != ?
			 AND EXISTS (
				SELECT 1 FROM legal_releases WHERE id = ? AND status = 'active'
			 )`,
		).bind(policy.type, policy.id, policy.releaseId),
		runtimeEnv.DB.prepare(
			`INSERT INTO c15t_consentPolicy
			 (id, version, type, hash, effectiveDate, isActive, createdAt)
			 SELECT ?, ?, ?, ?, ?, 1, unixepoch()
			 WHERE EXISTS (
				SELECT 1 FROM legal_releases WHERE id = ? AND status = 'active'
			 )
			 ON CONFLICT(id) DO UPDATE SET isActive = 1`,
		).bind(
			policy.id,
			policy.version,
			policy.type,
			policy.hash,
			policy.effectiveDateSeconds,
			policy.releaseId,
		),
	];
}

export async function ensureActiveLegalConsentPolicy(
	runtimeEnv: Env,
	release: LegalConsentDocumentRelease,
): Promise<void> {
	const consentRelease = await legalConsentReleaseForDocument(release);
	const policy = await legalConsentPolicy(runtimeEnv, consentRelease);
	const active = await runtimeEnv.DB.prepare(
		'SELECT id FROM c15t_consentPolicy WHERE type = ? AND isActive = 1',
	)
		.bind(policy.type)
		.first<{ id: string }>();
	if (active?.id === policy.id) return;

	await runtimeEnv.DB.batch(
		activeReleaseConsentPolicyStatements(runtimeEnv, policy),
	);
}

async function legalReleaseConsentData(releaseId: number): Promise<{
	release: NonNullable<Awaited<ReturnType<typeof getLegalReleaseById>>>;
	document: NonNullable<Awaited<ReturnType<typeof getLegalDocumentById>>>;
	variants: Awaited<ReturnType<typeof getLegalReleaseVariants>>;
}> {
	const release = await getLegalReleaseById(releaseId);
	if (!release) {
		const error = new Error('Legal release not found');
		error.name = 'LEGAL_RELEASE_NOT_FOUND';
		throw error;
	}
	const document = await getLegalDocumentById(release.documentId);
	if (!document) {
		const error = new Error('Legal document not found');
		error.name = 'LEGAL_DOCUMENT_NOT_FOUND';
		throw error;
	}
	const variants = await getLegalReleaseVariants(release.id);
	return { release, document, variants };
}

function consentReleaseFromData(
	data: Awaited<ReturnType<typeof legalReleaseConsentData>>,
): LegalConsentRelease | null {
	if (data.variants.length === 0) return null;
	const complete = data.variants.every(
		variant =>
			Boolean(variant.releaseHash) &&
			Boolean(variant.signature) &&
			Boolean(variant.signingKeyId) &&
			Boolean(variant.publicJwk) &&
			Boolean(variant.pdfKey),
	);
	if (!complete) return null;
	return {
		releaseId: data.release.id,
		type: data.document.type,
		slug: data.document.slug,
		version: data.release.version,
		effectiveDate: data.release.effectiveDate,
		documents: data.variants.map(variant => ({
			locale: variant.locale,
			releaseHash: variant.releaseHash as string,
		})),
	};
}

function requireConsentRelease(
	data: Awaited<ReturnType<typeof legalReleaseConsentData>>,
): LegalConsentRelease {
	const release = consentReleaseFromData(data);
	if (release) return release;
	const error = new Error(
		'Every locale must have complete signed artifacts before activation',
	);
	error.name = 'LEGAL_RELEASE_ARTIFACTS_INCOMPLETE';
	throw error;
}

async function legalConsentReleaseForDocument(
	document: LegalConsentDocumentRelease,
): Promise<LegalConsentRelease> {
	const consentRelease = requireConsentRelease(
		await legalReleaseConsentData(document.releaseId),
	);
	const matchingDocument = consentRelease?.documents.some(
		variant =>
			variant.locale === document.locale &&
			variant.releaseHash === document.releaseHash,
	);
	if (!matchingDocument) {
		const error = new Error('Legal release variant not found');
		error.name = 'LEGAL_DOCUMENT_NOT_FOUND';
		throw error;
	}
	return consentRelease;
}

export async function activateLegalReleaseWithConsentPolicy(
	runtimeEnv: Env,
	releaseId: number,
): Promise<void> {
	const data = await legalReleaseConsentData(releaseId);
	const { release } = data;
	const consentRelease = requireConsentRelease(data);
	const statements: D1PreparedStatement[] = [];
	const policy = await legalConsentPolicy(runtimeEnv, consentRelease);
	statements.push(...consentPolicyStatements(runtimeEnv, policy));
	statements.push(
		runtimeEnv.DB.prepare(
			`UPDATE legal_releases
			 SET status = 'retired', retiredAt = CURRENT_TIMESTAMP
			 WHERE documentId = ? AND status = 'active' AND id != ?
			 AND EXISTS (
				SELECT 1 FROM legal_releases
				WHERE id = ? AND status IN ('processing', 'published')
			 )`,
		).bind(release.documentId, release.id, release.id),
		runtimeEnv.DB.prepare(
			`UPDATE legal_releases
			 SET status = 'active',
				 publishedAt = COALESCE(publishedAt, CURRENT_TIMESTAMP),
				 activatedAt = COALESCE(activatedAt, CURRENT_TIMESTAMP),
				 retiredAt = NULL,
				 failureReason = NULL
			 WHERE id = ? AND status IN ('processing', 'published')`,
		).bind(release.id),
		runtimeEnv.DB.prepare(
			`SELECT EXISTS (
				SELECT 1
				FROM legal_releases AS legalRelease
				JOIN c15t_consentPolicy AS policy ON policy.id = ?
				WHERE legalRelease.id = ?
				AND legalRelease.status = 'active' AND policy.isActive = 1
			 ) AS matchesActiveState`,
		).bind(policy.id, release.id),
	);
	const results = await runtimeEnv.DB.batch(statements);
	const transition = results.at(-2);
	if (transition?.meta.changes === 1) return;
	const classification = results.at(-1)?.results.at(0) as
		{ matchesActiveState?: number } | undefined;
	if (classification?.matchesActiveState === 1) return;
	const error = new Error(
		'Only a processing or published release can be activated',
	);
	error.name = 'LEGAL_RELEASE_NOT_ACTIVATABLE';
	throw error;
}

export async function retireLegalReleaseWithConsentPolicy(
	runtimeEnv: Env,
	releaseId: number,
): Promise<void> {
	const data = await legalReleaseConsentData(releaseId);
	const consentRelease = consentReleaseFromData(data);
	const statements: D1PreparedStatement[] = [];
	if (consentRelease) {
		const policy = await legalConsentPolicy(runtimeEnv, consentRelease);
		statements.push(
			runtimeEnv.DB.prepare(
				`UPDATE c15t_consentPolicy
				 SET isActive = 0
				 WHERE type = ?
				 AND EXISTS (
					SELECT 1 FROM legal_releases
					WHERE id = ? AND status = 'active'
				 )`,
			).bind(policy.type, releaseId),
		);
	}
	statements.push(
		runtimeEnv.DB.prepare(
			`UPDATE legal_releases
			 SET status = 'retired', retiredAt = CURRENT_TIMESTAMP
			 WHERE id = ? AND status IN ('published', 'active')`,
		).bind(releaseId),
	);
	const results = await runtimeEnv.DB.batch(statements);
	const transition = results.at(-1);
	if (transition?.meta.changes !== 1) {
		const error = new Error(
			'Only a published or active release can be retired',
		);
		error.name = 'LEGAL_RELEASE_NOT_RETIRABLE';
		throw error;
	}
}

async function responseObject(
	response: Response,
): Promise<Record<string, unknown>> {
	const value: unknown = await response.json();
	if (!value || typeof value !== 'object') return {};
	return value as Record<string, unknown>;
}

function responseError(value: Record<string, unknown>, status: number): Error {
	const message =
		typeof value.message === 'string'
			? value.message
			: `Consent request failed with status ${status}`;
	const error = new Error(message);
	if (typeof value.code === 'string') error.name = value.code;
	return error;
}

function requiredConsentEvidence(value: unknown, field: string): string {
	if (typeof value === 'string' && value.trim()) return value;
	const error = new Error(`${field} is required for RPC legal consent`);
	error.name = 'INPUT_VALIDATION_FAILED';
	throw error;
}

function legalConsentReceipt(
	value: Record<string, unknown>,
): LegalConsentReceipt {
	const fields = [
		'subjectId',
		'consentId',
		'domainId',
		'domain',
		'type',
		'givenAt',
	] as const;
	for (const field of fields) {
		if (typeof value[field] !== 'string') {
			throw new Error('c15t returned an invalid legal consent receipt');
		}
	}
	const receipt: LegalConsentReceipt = {
		subjectId: value.subjectId as string,
		consentId: value.consentId as string,
		domainId: value.domainId as string,
		domain: value.domain as string,
		type: value.type as string,
		givenAt: value.givenAt as string,
	};
	if (isRecord(value.metadata)) {
		receipt.metadata = value.metadata as Record<
			string,
			LegalConsentMetadataValue
		>;
	}
	if (typeof value.uiSource === 'string') {
		receipt.uiSource = value.uiSource;
	}
	return receipt;
}

function legalConsentSubjectIdentification(
	value: Record<string, unknown>,
): IdentifyLegalConsentSubjectResult {
	if (value.success !== true || !isRecord(value.subject)) {
		throw new Error('c15t returned an invalid subject identification');
	}
	const { id, externalId } = value.subject;
	if (typeof id !== 'string' || typeof externalId !== 'string') {
		throw new Error('c15t returned an invalid subject identification');
	}
	return { success: true, subject: { id, externalId } };
}

export async function recordLegalConsent(
	runtimeEnv: Env,
	input: RecordLegalConsentInput,
): Promise<LegalConsentReceipt> {
	const origin = new URL(runtimeEnv.BASE_URL).origin;
	const ipAddress = requiredConsentEvidence(input.ipAddress, 'ipAddress');
	const userAgent = requiredConsentEvidence(input.userAgent, 'userAgent');
	const uiSource = requiredConsentEvidence(input.uiSource, 'uiSource');
	const response = await handleConsentRequestWithAccess(
		new Request(`${origin}${CONSENT_BASE_PATH}/subjects`, {
			method: 'POST',
			headers: {
				'CF-Connecting-IP': ipAddress,
				'Content-Type': 'application/json',
				Origin: origin,
				'User-Agent': userAgent,
			},
			body: JSON.stringify({
				type: input.type,
				subjectId: input.subjectId,
				domain: input.domain,
				externalSubjectId: input.externalSubjectId,
				identityProvider: input.identityProvider,
				metadata: input.metadata,
				givenAt: input.givenAt ?? Date.now(),
				uiSource,
				documentSnapshotToken: input.documentSnapshotToken,
			}),
		}),
		runtimeEnv,
		undefined,
		'service',
	);
	const value = await responseObject(response);
	if (!response.ok) throw responseError(value, response.status);
	return legalConsentReceipt(value);
}

export async function identifyLegalConsentSubject(
	runtimeEnv: Env,
	input: IdentifyLegalConsentSubjectInput,
): Promise<IdentifyLegalConsentSubjectResult> {
	const origin = new URL(runtimeEnv.BASE_URL).origin;
	const ipAddress = requiredConsentEvidence(input.ipAddress, 'ipAddress');
	const userAgent = requiredConsentEvidence(input.userAgent, 'userAgent');
	const response = await handleConsentRequestWithAccess(
		new Request(
			`${origin}${CONSENT_BASE_PATH}/subjects/${encodeURIComponent(input.subjectId)}`,
			{
				method: 'PATCH',
				headers: {
					'CF-Connecting-IP': ipAddress,
					'Content-Type': 'application/json',
					Origin: origin,
					'User-Agent': userAgent,
				},
				body: JSON.stringify({
					externalId: input.externalId,
					identityProvider: input.identityProvider,
				}),
			},
		),
		runtimeEnv,
		undefined,
		'service',
	);
	const value = await responseObject(response);
	if (!response.ok) throw responseError(value, response.status);
	return legalConsentSubjectIdentification(value);
}
