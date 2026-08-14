import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import {
	legalDocumentDrafts,
	legalDocuments,
	legalReleases,
	legalReleaseVariants,
} from '../schema.server';
import type {
	LegalDocument,
	LegalDocumentDraft,
	LegalDocumentType,
	LegalRelease,
	LegalReleaseStatus,
	LegalReleaseVariant,
} from './types';

const db = drizzle(env.DB);

function toDocument(row: typeof legalDocuments.$inferSelect): LegalDocument {
	return {
		...row,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	};
}

function toDraft(
	row: typeof legalDocumentDrafts.$inferSelect,
): LegalDocumentDraft {
	return {
		...row,
		updatedAt: new Date(row.updatedAt),
	};
}

function toRelease(row: typeof legalReleases.$inferSelect): LegalRelease {
	return {
		...row,
		createdAt: new Date(row.createdAt),
		publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
		activatedAt: row.activatedAt ? new Date(row.activatedAt) : null,
		retiredAt: row.retiredAt ? new Date(row.retiredAt) : null,
	};
}

export interface LegalDocumentSummary extends LegalDocument {
	draftLocaleCount: number;
	releaseCount: number;
	activeVersion: string | null;
}

export async function getLegalDocuments(): Promise<LegalDocumentSummary[]> {
	const rows = await db
		.select({
			document: legalDocuments,
			draftLocaleCount: sql<number>`COUNT(DISTINCT ${legalDocumentDrafts.locale})`,
			releaseCount: sql<number>`COUNT(DISTINCT ${legalReleases.id})`,
			activeVersion: sql<
				string | null
			>`MAX(CASE WHEN ${legalReleases.status} = 'active' THEN ${legalReleases.version} END)`,
		})
		.from(legalDocuments)
		.leftJoin(
			legalDocumentDrafts,
			eq(legalDocuments.id, legalDocumentDrafts.documentId),
		)
		.leftJoin(legalReleases, eq(legalDocuments.id, legalReleases.documentId))
		.groupBy(legalDocuments.id)
		.orderBy(asc(legalDocuments.name));

	return rows.map(row => ({
		...toDocument(row.document),
		draftLocaleCount: row.draftLocaleCount,
		releaseCount: row.releaseCount,
		activeVersion: row.activeVersion,
	}));
}

export async function getLegalDocumentById(
	documentId: number,
): Promise<LegalDocument | null> {
	const [row] = await db
		.select()
		.from(legalDocuments)
		.where(eq(legalDocuments.id, documentId));
	return row ? toDocument(row) : null;
}

export async function getLegalDocumentBySlug(
	slug: string,
): Promise<LegalDocument | null> {
	const [row] = await db
		.select()
		.from(legalDocuments)
		.where(eq(legalDocuments.slug, slug));
	return row ? toDocument(row) : null;
}

export async function insertLegalDocument(input: {
	name: string;
	slug: string;
	type: LegalDocumentType;
	createdBy?: string;
}): Promise<LegalDocument> {
	const [row] = await db
		.insert(legalDocuments)
		.values({
			name: input.name,
			slug: input.slug,
			type: input.type,
			createdBy: input.createdBy ?? null,
		})
		.returning();
	return toDocument(row);
}

export async function updateLegalDocument(input: {
	id: number;
	name: string;
	slug: string;
	type: LegalDocumentType;
}): Promise<LegalDocument | null> {
	const [row] = await db
		.update(legalDocuments)
		.set({
			name: input.name,
			slug: input.slug,
			type: input.type,
			updatedAt: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(legalDocuments.id, input.id))
		.returning();
	return row ? toDocument(row) : null;
}

export async function removeLegalDocument(documentId: number): Promise<void> {
	await db.delete(legalDocuments).where(eq(legalDocuments.id, documentId));
}

export async function countLegalReleases(documentId: number): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(legalReleases)
		.where(eq(legalReleases.documentId, documentId));
	return row.value;
}

export async function getLegalDrafts(
	documentId: number,
): Promise<LegalDocumentDraft[]> {
	const rows = await db
		.select()
		.from(legalDocumentDrafts)
		.where(eq(legalDocumentDrafts.documentId, documentId))
		.orderBy(asc(legalDocumentDrafts.locale));
	return rows.map(toDraft);
}

export async function upsertLegalDraft(input: {
	documentId: number;
	locale: string;
	markdown: string;
	updatedBy?: string;
}): Promise<LegalDocumentDraft> {
	const [row] = await db
		.insert(legalDocumentDrafts)
		.values({
			documentId: input.documentId,
			locale: input.locale,
			markdown: input.markdown,
			updatedBy: input.updatedBy ?? null,
		})
		.onConflictDoUpdate({
			target: [legalDocumentDrafts.documentId, legalDocumentDrafts.locale],
			set: {
				markdown: input.markdown,
				updatedBy: input.updatedBy ?? null,
				updatedAt: sql`CURRENT_TIMESTAMP`,
			},
		})
		.returning();
	return toDraft(row);
}

export async function createFrozenLegalRelease(input: {
	documentId: number;
	version: string;
	effectiveDate: string;
	createdBy?: string;
	variants: Array<{ locale: string; payload: string }>;
}): Promise<LegalRelease> {
	const [release] = await db
		.insert(legalReleases)
		.values({
			documentId: input.documentId,
			version: input.version,
			effectiveDate: input.effectiveDate,
			status: 'processing',
			createdBy: input.createdBy ?? null,
		})
		.returning();

	await db.insert(legalReleaseVariants).values(
		input.variants.map(variant => ({
			releaseId: release.id,
			locale: variant.locale,
			payload: variant.payload,
		})),
	);

	return toRelease(release);
}

export async function setLegalReleaseWorkflow(
	releaseId: number,
	workflowId: string,
): Promise<void> {
	await db
		.update(legalReleases)
		.set({ workflowId, failureReason: null })
		.where(eq(legalReleases.id, releaseId));
}

export async function getLegalReleaseById(
	releaseId: number,
): Promise<LegalRelease | null> {
	const [row] = await db
		.select()
		.from(legalReleases)
		.where(eq(legalReleases.id, releaseId));
	return row ? toRelease(row) : null;
}

export async function getLegalReleases(
	documentId: number,
): Promise<LegalRelease[]> {
	const rows = await db
		.select()
		.from(legalReleases)
		.where(eq(legalReleases.documentId, documentId))
		.orderBy(desc(legalReleases.id));
	return rows.map(toRelease);
}

export async function getLegalReleaseVariants(
	releaseId: number,
): Promise<LegalReleaseVariant[]> {
	return db
		.select()
		.from(legalReleaseVariants)
		.where(eq(legalReleaseVariants.releaseId, releaseId))
		.orderBy(asc(legalReleaseVariants.locale));
}

export async function removeFailedLegalRelease(
	releaseId: number,
): Promise<boolean> {
	const rows = await db
		.delete(legalReleases)
		.where(
			and(eq(legalReleases.id, releaseId), eq(legalReleases.status, 'failed')),
		)
		.returning({ id: legalReleases.id });
	return rows.length > 0;
}

export async function saveLegalReleaseVariantArtifacts(input: {
	variantId: number;
	releaseHash: string;
	signature: string;
	signingKeyId: string;
	publicJwk: string;
	pdfKey: string;
}): Promise<void> {
	await db
		.update(legalReleaseVariants)
		.set({
			releaseHash: input.releaseHash,
			signature: input.signature,
			signingKeyId: input.signingKeyId,
			publicJwk: input.publicJwk,
			pdfKey: input.pdfKey,
		})
		.where(eq(legalReleaseVariants.id, input.variantId));
}

export async function markLegalReleasePublished(
	releaseId: number,
): Promise<void> {
	await db
		.update(legalReleases)
		.set({
			status: 'published',
			publishedAt: sql`CURRENT_TIMESTAMP`,
			failureReason: null,
		})
		.where(eq(legalReleases.id, releaseId));
}

export async function publishLegalReleaseAsCurrent(
	releaseId: number,
): Promise<void> {
	const release = await getLegalReleaseById(releaseId);
	if (!release) throw new Error('Legal release not found');

	await db.batch([
		db
			.update(legalReleases)
			.set({ status: 'retired', retiredAt: sql`CURRENT_TIMESTAMP` })
			.where(
				and(
					eq(legalReleases.documentId, release.documentId),
					eq(legalReleases.status, 'active'),
					ne(legalReleases.id, release.id),
				),
			),
		db
			.update(legalReleases)
			.set({
				status: 'active',
				publishedAt: sql`COALESCE(${legalReleases.publishedAt}, CURRENT_TIMESTAMP)`,
				activatedAt: sql`COALESCE(${legalReleases.activatedAt}, CURRENT_TIMESTAMP)`,
				retiredAt: null,
				failureReason: null,
			})
			.where(eq(legalReleases.id, release.id)),
	]);
}

export async function markLegalReleaseFailed(
	releaseId: number,
	reason: string,
): Promise<void> {
	await db
		.update(legalReleases)
		.set({ status: 'failed', failureReason: reason })
		.where(eq(legalReleases.id, releaseId));
}

export async function markLegalReleaseProcessing(
	releaseId: number,
): Promise<void> {
	await db
		.update(legalReleases)
		.set({ status: 'processing', failureReason: null })
		.where(eq(legalReleases.id, releaseId));
}

export async function activateLegalReleaseRow(
	release: LegalRelease,
): Promise<void> {
	await db.batch([
		db
			.update(legalReleases)
			.set({ status: 'retired', retiredAt: sql`CURRENT_TIMESTAMP` })
			.where(
				and(
					eq(legalReleases.documentId, release.documentId),
					eq(legalReleases.status, 'active'),
					ne(legalReleases.id, release.id),
				),
			),
		db
			.update(legalReleases)
			.set({
				status: 'active',
				activatedAt: sql`CURRENT_TIMESTAMP`,
				retiredAt: null,
			})
			.where(eq(legalReleases.id, release.id)),
	]);
}

export async function retireLegalReleaseRow(releaseId: number): Promise<void> {
	await db
		.update(legalReleases)
		.set({ status: 'retired', retiredAt: sql`CURRENT_TIMESTAMP` })
		.where(eq(legalReleases.id, releaseId));
}

export async function getActiveLegalVariant(input: {
	slug: string;
	locale: string;
}): Promise<{
	document: LegalDocument;
	release: LegalRelease;
	variant: LegalReleaseVariant;
} | null> {
	const [row] = await db
		.select({
			document: legalDocuments,
			release: legalReleases,
			variant: legalReleaseVariants,
		})
		.from(legalDocuments)
		.innerJoin(
			legalReleases,
			and(
				eq(legalDocuments.id, legalReleases.documentId),
				eq(legalReleases.status, 'active'),
			),
		)
		.innerJoin(
			legalReleaseVariants,
			and(
				eq(legalReleases.id, legalReleaseVariants.releaseId),
				eq(legalReleaseVariants.locale, input.locale),
			),
		)
		.where(eq(legalDocuments.slug, input.slug));
	if (!row) return null;
	return {
		document: toDocument(row.document),
		release: toRelease(row.release),
		variant: row.variant,
	};
}

export async function getLegalVariantByReleaseHash(input: {
	slug: string;
	locale: string;
	releaseHash: string;
}): Promise<{
	document: LegalDocument;
	release: LegalRelease;
	variant: LegalReleaseVariant;
} | null> {
	const [row] = await db
		.select({
			document: legalDocuments,
			release: legalReleases,
			variant: legalReleaseVariants,
		})
		.from(legalDocuments)
		.innerJoin(
			legalReleases,
			and(
				eq(legalDocuments.id, legalReleases.documentId),
				inArray(legalReleases.status, ['published', 'active', 'retired']),
			),
		)
		.innerJoin(
			legalReleaseVariants,
			and(
				eq(legalReleases.id, legalReleaseVariants.releaseId),
				eq(legalReleaseVariants.locale, input.locale),
				eq(legalReleaseVariants.releaseHash, input.releaseHash),
			),
		)
		.where(eq(legalDocuments.slug, input.slug));
	if (!row) return null;
	return {
		document: toDocument(row.document),
		release: toRelease(row.release),
		variant: row.variant,
	};
}

export async function getPublishedLegalPublicKeys(): Promise<
	Array<{ keyId: string; publicJwk: JsonWebKey }>
> {
	const rows = await db
		.selectDistinct({
			keyId: legalReleaseVariants.signingKeyId,
			publicJwk: legalReleaseVariants.publicJwk,
		})
		.from(legalReleaseVariants)
		.innerJoin(
			legalReleases,
			eq(legalReleaseVariants.releaseId, legalReleases.id),
		)
		.where(
			and(
				inArray(legalReleases.status, ['published', 'active', 'retired']),
				sql`${legalReleaseVariants.signingKeyId} IS NOT NULL`,
				sql`${legalReleaseVariants.publicJwk} IS NOT NULL`,
			),
		);
	return rows.map(row => ({
		keyId: row.keyId!,
		publicJwk: JSON.parse(row.publicJwk!) as JsonWebKey,
	}));
}
