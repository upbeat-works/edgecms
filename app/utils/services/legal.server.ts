import { env } from 'cloudflare:workers';
import {
	activateLegalReleaseRow,
	countLegalReleases,
	createFrozenLegalRelease,
	getLegalDocumentById,
	getLegalDrafts,
	getLegalReleaseById,
	getLanguages,
	insertLegalDocument,
	markLegalReleaseFailed,
	markLegalReleaseProcessing,
	removeFailedLegalRelease,
	removeLegalDocument,
	retireLegalReleaseRow,
	setLegalReleaseWorkflow,
	updateLegalDocument as updateLegalDocumentRow,
	upsertLegalDraft,
} from '../db.server';
import type { LegalDocumentType } from '../db/types';
import {
	parseLegalSigningPrivateJwk,
	serializeLegalReleasePayload,
} from '../legal-release.server';
import { err, ok, type ServiceResult } from './result';

const LEGAL_DOCUMENT_TYPES = new Set<LegalDocumentType>([
	'terms_and_conditions',
	'privacy_policy',
	'cookie_policy',
	'dpa',
	'other',
]);

export interface CreateLegalDocumentInput {
	name: string;
	slug: string;
	type: LegalDocumentType;
	userId?: string;
}

export interface LegalDocumentResult {
	id: number;
	name: string;
	slug: string;
	type: LegalDocumentType;
}

export interface LegalDocumentDraftResult {
	documentId: number;
	locale: string;
	state: 'draft';
}

export interface CreatedLegalDocumentDraftResult extends LegalDocumentResult {
	locale: string;
	state: 'draft';
}

export function normalizeLegalSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
}

function validateDocumentFields(input: {
	name: string;
	slug: string;
	type: LegalDocumentType;
}): ServiceResult<{ name: string; slug: string; type: LegalDocumentType }> {
	const name = input.name.trim();
	const slug = normalizeLegalSlug(input.slug);
	if (name.length === 0 || slug.length === 0) {
		return err(
			'VALIDATION_ERROR',
			'Name and a valid public slug are required',
			400,
		);
	}
	if (!LEGAL_DOCUMENT_TYPES.has(input.type)) {
		return err('VALIDATION_ERROR', 'Unsupported legal document type', 400);
	}
	return ok({ name, slug, type: input.type });
}

function isUniqueConstraintError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes('UNIQUE constraint failed') ||
			error.message.includes('SQLITE_CONSTRAINT'))
	);
}

export async function createLegalDocument(
	input: CreateLegalDocumentInput,
): Promise<ServiceResult<LegalDocumentResult>> {
	const validated = validateDocumentFields(input);
	if (!validated.ok) return validated;
	try {
		const document = await insertLegalDocument({
			...validated.data,
			createdBy: input.userId,
		});
		return ok(document);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return err(
				'LEGAL_SLUG_EXISTS',
				`A legal document already uses the slug "${validated.data.slug}"`,
				409,
			);
		}
		throw error;
	}
}

function findConfiguredLocale(
	languages: Awaited<ReturnType<typeof getLanguages>>,
	locale: string,
) {
	return languages.find(
		candidate => candidate.locale.toLowerCase() === locale.toLowerCase(),
	);
}

export async function createLegalDocumentDraft(
	input: CreateLegalDocumentInput & { locale: string; markdown: string },
): Promise<ServiceResult<CreatedLegalDocumentDraftResult>> {
	const language = findConfiguredLocale(await getLanguages(), input.locale);
	if (!language) {
		return err(
			'LOCALE_NOT_FOUND',
			`Locale "${input.locale}" is not configured`,
			404,
		);
	}

	const document = await createLegalDocument(input);
	if (!document.ok) return document;

	try {
		await upsertLegalDraft({
			documentId: document.data.id,
			locale: language.locale,
			markdown: input.markdown,
			updatedBy: input.userId,
		});
	} catch (error) {
		await removeLegalDocument(document.data.id);
		throw error;
	}

	return ok({
		...document.data,
		locale: language.locale,
		state: 'draft',
	});
}

export async function updateLegalDocument(input: {
	documentId: number;
	name: string;
	slug: string;
	type: LegalDocumentType;
}): Promise<ServiceResult<LegalDocumentResult>> {
	const validated = validateDocumentFields(input);
	if (!validated.ok) return validated;
	const [existing, releaseCount] = await Promise.all([
		getLegalDocumentById(input.documentId),
		countLegalReleases(input.documentId),
	]);
	if (!existing) {
		return err('LEGAL_DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
	}
	if (
		releaseCount > 0 &&
		(existing.slug !== validated.data.slug ||
			existing.type !== validated.data.type)
	) {
		return err(
			'LEGAL_DOCUMENT_IDENTITY_FROZEN',
			'Slug and document type cannot change after release history begins',
			409,
		);
	}
	try {
		const document = await updateLegalDocumentRow({
			id: input.documentId,
			...validated.data,
		});
		return document
			? ok(document)
			: err('LEGAL_DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return err(
				'LEGAL_SLUG_EXISTS',
				`A legal document already uses the slug "${validated.data.slug}"`,
				409,
			);
		}
		throw error;
	}
}

export async function saveLegalDraft(input: {
	documentId: number;
	locale: string;
	markdown: string;
	userId?: string;
}): Promise<ServiceResult<LegalDocumentDraftResult>> {
	const [document, languages] = await Promise.all([
		getLegalDocumentById(input.documentId),
		getLanguages(),
	]);
	if (!document) {
		return err('LEGAL_DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
	}
	const language = findConfiguredLocale(languages, input.locale);
	if (!language) {
		return err(
			'LOCALE_NOT_FOUND',
			`Locale "${input.locale}" is not configured`,
			404,
		);
	}
	await upsertLegalDraft({
		documentId: input.documentId,
		locale: language.locale,
		markdown: input.markdown,
		updatedBy: input.userId,
	});
	return ok({
		documentId: input.documentId,
		locale: language.locale,
		state: 'draft',
	});
}

function isValidEffectiveDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

function ensureLegalSigningIsConfigured(): ServiceResult<void> {
	const keyId = env.LEGAL_SIGNING_KEY_ID.trim();
	if (!keyId) {
		return err(
			'LEGAL_SIGNING_NOT_CONFIGURED',
			'LEGAL_SIGNING_KEY_ID is not configured',
			503,
		);
	}
	try {
		parseLegalSigningPrivateJwk(env.LEGAL_SIGNING_PRIVATE_JWK);
		return ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err('LEGAL_SIGNING_NOT_CONFIGURED', message, 503);
	}
}

export async function publishLegalDocument(input: {
	documentId: number;
	version: string;
	effectiveDate: string;
	userId?: string;
}): Promise<ServiceResult<{ releaseId: number; publishId: string }>> {
	const version = input.version.trim();
	if (version.length === 0 || !isValidEffectiveDate(input.effectiveDate)) {
		return err('VALIDATION_ERROR', 'A valid publication date is required', 400);
	}
	const [document, drafts, languages] = await Promise.all([
		getLegalDocumentById(input.documentId),
		getLegalDrafts(input.documentId),
		getLanguages(),
	]);
	if (!document) {
		return err('LEGAL_DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
	}
	const defaultLocale = languages.find(language => language.default)?.locale;
	if (!defaultLocale) {
		return err(
			'NO_DEFAULT_LANGUAGE',
			'Cannot publish without a default language',
			409,
		);
	}
	const includedDrafts = drafts.filter(
		draft => draft.markdown.trim().length > 0,
	);
	if (!includedDrafts.some(draft => draft.locale === defaultLocale)) {
		return err(
			'DEFAULT_LEGAL_DRAFT_REQUIRED',
			`Add content for the default locale ${defaultLocale} before publishing`,
			409,
		);
	}
	const signingConfiguration = ensureLegalSigningIsConfigured();
	if (!signingConfiguration.ok) return signingConfiguration;

	let release;
	try {
		release = await createFrozenLegalRelease({
			documentId: document.id,
			version,
			effectiveDate: input.effectiveDate,
			createdBy: input.userId,
			variants: includedDrafts.map(draft => ({
				locale: draft.locale,
				payload: serializeLegalReleasePayload({
					documentId: document.id,
					slug: document.slug,
					type: document.type,
					locale: draft.locale,
					version,
					effectiveDate: input.effectiveDate,
					markdown: draft.markdown,
				}),
			})),
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return err(
				'LEGAL_VERSION_EXISTS',
				`This document already has a publication for ${input.effectiveDate}`,
				409,
			);
		}
		throw error;
	}

	try {
		const instance = await env.LEGAL_RELEASE_WORKFLOW.create({
			params: { releaseId: release.id },
		});
		await setLegalReleaseWorkflow(release.id, instance.id);
		return ok({ releaseId: release.id, publishId: instance.id });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await markLegalReleaseFailed(release.id, reason);
		return err(
			'LEGAL_PUBLISH_START_FAILED',
			'Could not start legal document publication',
			503,
		);
	}
}

export async function retryLegalRelease(
	releaseId: number,
): Promise<ServiceResult<{ releaseId: number; publishId: string }>> {
	const release = await getLegalReleaseById(releaseId);
	if (!release) {
		return err('LEGAL_RELEASE_NOT_FOUND', 'Legal release not found', 404);
	}
	if (release.status !== 'failed') {
		return err(
			'LEGAL_RELEASE_NOT_RETRYABLE',
			'Only failed legal releases can be retried',
			409,
		);
	}
	const signingConfiguration = ensureLegalSigningIsConfigured();
	if (!signingConfiguration.ok) return signingConfiguration;
	await markLegalReleaseProcessing(release.id);
	try {
		const instance = await env.LEGAL_RELEASE_WORKFLOW.create({
			params: { releaseId: release.id },
		});
		await setLegalReleaseWorkflow(release.id, instance.id);
		return ok({ releaseId: release.id, publishId: instance.id });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await markLegalReleaseFailed(release.id, reason);
		return err(
			'LEGAL_PUBLISH_START_FAILED',
			'Could not restart legal document publication',
			503,
		);
	}
}

export async function discardFailedLegalRelease(input: {
	releaseId: number;
	documentId: number;
}): Promise<ServiceResult<{ releaseId: number }>> {
	const release = await getLegalReleaseById(input.releaseId);
	if (!release || release.documentId !== input.documentId) {
		return err('LEGAL_RELEASE_NOT_FOUND', 'Legal release not found', 404);
	}
	if (release.status !== 'failed') {
		return err(
			'LEGAL_RELEASE_NOT_DISCARDABLE',
			'Only failed legal publications can be discarded',
			409,
		);
	}

	const prefix = `legal/${release.documentId}/${release.id}/`;
	let cursor: string | undefined;
	do {
		const listing = await env.MEDIA_BUCKET.list({ prefix, cursor });
		if (listing.objects.length > 0) {
			await env.MEDIA_BUCKET.delete(listing.objects.map(object => object.key));
		}
		cursor = listing.truncated ? listing.cursor : undefined;
	} while (cursor);

	const removed = await removeFailedLegalRelease(release.id);
	if (!removed) {
		return err(
			'LEGAL_RELEASE_NOT_DISCARDABLE',
			'Only failed legal publications can be discarded',
			409,
		);
	}
	return ok({ releaseId: release.id });
}

export async function activateLegalRelease(
	releaseId: number,
): Promise<ServiceResult<{ releaseId: number }>> {
	const release = await getLegalReleaseById(releaseId);
	if (!release) {
		return err('LEGAL_RELEASE_NOT_FOUND', 'Legal release not found', 404);
	}
	if (release.status !== 'published') {
		return err(
			'LEGAL_RELEASE_NOT_PUBLISHED',
			'Only a published release can be activated',
			409,
		);
	}
	await activateLegalReleaseRow(release);
	return ok({ releaseId });
}

export async function retireLegalRelease(
	releaseId: number,
): Promise<ServiceResult<{ releaseId: number }>> {
	const release = await getLegalReleaseById(releaseId);
	if (!release) {
		return err('LEGAL_RELEASE_NOT_FOUND', 'Legal release not found', 404);
	}
	if (release.status !== 'active' && release.status !== 'published') {
		return err(
			'LEGAL_RELEASE_NOT_RETIRABLE',
			'Only published or active releases can be retired',
			409,
		);
	}
	await retireLegalReleaseRow(releaseId);
	return ok({ releaseId });
}

export async function deleteLegalDocument(
	documentId: number,
): Promise<ServiceResult<{ documentId: number }>> {
	const document = await getLegalDocumentById(documentId);
	if (!document) {
		return err('LEGAL_DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
	}
	if ((await countLegalReleases(documentId)) > 0) {
		return err(
			'LEGAL_DOCUMENT_HAS_RELEASES',
			'A document with release history cannot be deleted',
			409,
		);
	}
	await removeLegalDocument(documentId);
	return ok({ documentId });
}
