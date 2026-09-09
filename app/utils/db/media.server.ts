import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { mediaAssets, mediaRevisions } from '../schema.server';
import type { Media, MediaRevision } from './types';

const db = drizzle(env.DB);

function toMedia(
	asset: typeof mediaAssets.$inferSelect,
	revision: typeof mediaRevisions.$inferSelect,
): Media {
	return {
		id: asset.id,
		revisionId: revision.id,
		filename: asset.filename,
		section: asset.section,
		mimeType: revision.mimeType,
		sizeBytes: revision.sizeBytes,
		state: revision.state,
		uploadedAt: new Date(revision.uploadedAt),
		version: revision.version,
	};
}

function toMediaRevision(
	asset: typeof mediaAssets.$inferSelect,
	revision: typeof mediaRevisions.$inferSelect,
): MediaRevision {
	return { ...toMedia(asset, revision), assetId: asset.id };
}

export async function getMedia(options?: {
	section?: string;
	state?: 'live' | 'archived';
	filename?: string;
}): Promise<MediaRevision[]> {
	const filters = [];
	if (options?.section) filters.push(eq(mediaAssets.section, options.section));
	if (options?.state) filters.push(eq(mediaRevisions.state, options.state));
	if (options?.filename)
		filters.push(eq(mediaAssets.filename, options.filename));
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaRevisions)
		.innerJoin(mediaAssets, eq(mediaAssets.id, mediaRevisions.assetId))
		.where(and(...filters))
		.orderBy(desc(mediaRevisions.uploadedAt));
	return rows.map(row => toMediaRevision(row.asset, row.revision));
}

export async function getLatestMediaVersions(options?: {
	section?: string;
	state?: 'live' | 'archived';
}): Promise<(Media & { count: number })[]> {
	const bestVersions = db
		.select({
			assetId: mediaRevisions.assetId,
			count: sql<number>`COUNT(*)`.as('version_count'),
			bestVersion:
				sql<number>`COALESCE(MAX(CASE WHEN ${mediaRevisions.state} = 'live' THEN ${mediaRevisions.version} END), MAX(${mediaRevisions.version}))`.as(
					'best_version',
				),
		})
		.from(mediaRevisions)
		.groupBy(mediaRevisions.assetId)
		.as('best_versions');
	const filters = [];
	if (options?.section) filters.push(eq(mediaAssets.section, options.section));
	if (options?.state) filters.push(eq(mediaRevisions.state, options.state));
	const rows = await db
		.select({
			asset: mediaAssets,
			revision: mediaRevisions,
			count: bestVersions.count,
		})
		.from(mediaRevisions)
		.innerJoin(mediaAssets, eq(mediaAssets.id, mediaRevisions.assetId))
		.innerJoin(
			bestVersions,
			and(
				eq(mediaRevisions.assetId, bestVersions.assetId),
				eq(mediaRevisions.version, bestVersions.bestVersion),
			),
		)
		.where(and(...filters));
	return rows.map(row => ({
		...toMedia(row.asset, row.revision),
		count: row.count,
	}));
}

async function createMediaRevision(props: {
	assetId: number;
	mimeType: string;
	sizeBytes: number;
	version?: number;
}): Promise<Media> {
	const [revision] = await db
		.insert(mediaRevisions)
		.values({
			assetId: props.assetId,
			mimeType: props.mimeType,
			sizeBytes: props.sizeBytes,
			version: props.version,
		})
		.returning();
	const [asset] = await db
		.select()
		.from(mediaAssets)
		.where(eq(mediaAssets.id, props.assetId));
	return toMedia(asset, revision);
}

export async function replaceMediaRevision(props: {
	assetId: number;
	mimeType: string;
	sizeBytes: number;
	version: number;
}): Promise<Media> {
	const [asset] = await db
		.select()
		.from(mediaAssets)
		.where(eq(mediaAssets.id, props.assetId));
	if (!asset) throw new Error(`Media asset ${props.assetId} not found`);

	const [, revisions] = await db.batch([
		db
			.update(mediaRevisions)
			.set({ state: 'archived' })
			.where(
				and(
					eq(mediaRevisions.assetId, props.assetId),
					eq(mediaRevisions.state, 'live'),
				),
			),
		db
			.insert(mediaRevisions)
			.values({
				assetId: props.assetId,
				mimeType: props.mimeType,
				sizeBytes: props.sizeBytes,
				version: props.version,
			})
			.returning(),
	]);
	return toMedia(asset, revisions[0]);
}

export async function createMedia(props: {
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section?: string;
	version?: number;
}): Promise<Media> {
	let [asset] = await db
		.select()
		.from(mediaAssets)
		.where(eq(mediaAssets.filename, props.filename));
	if (!asset) {
		const [assets, revisions] = await db.batch([
			db
				.insert(mediaAssets)
				.values({
					filename: props.filename,
					section: props.section || null,
				})
				.returning(),
			db
				.insert(mediaRevisions)
				.values({
					assetId: sql`(SELECT ${mediaAssets.id} FROM ${mediaAssets} WHERE ${mediaAssets.filename} = ${props.filename})`,
					mimeType: props.mimeType,
					sizeBytes: props.sizeBytes,
					version: props.version,
				})
				.returning(),
		]);
		return toMedia(assets[0], revisions[0]);
	}
	return createMediaRevision({
		assetId: asset.id,
		mimeType: props.mimeType,
		sizeBytes: props.sizeBytes,
		version: props.version,
	});
}

export async function updateMediaSection(
	assetId: number,
	section: string | null,
) {
	await db
		.update(mediaAssets)
		.set({ section })
		.where(eq(mediaAssets.id, assetId));
}

export async function renameMediaVersions(
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	await db
		.update(mediaAssets)
		.set({ filename: newFilename })
		.where(eq(mediaAssets.filename, oldFilename));
}

export async function getMediaByFilename(
	filename: string,
	version?: number,
): Promise<Media | null> {
	const filters = [eq(mediaAssets.filename, filename)];
	if (version != null) filters.push(eq(mediaRevisions.version, version));
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaAssets)
		.innerJoin(mediaRevisions, eq(mediaRevisions.assetId, mediaAssets.id))
		.where(and(...filters))
		.orderBy(
			desc(sql`CASE WHEN ${mediaRevisions.state} = 'live' THEN 1 ELSE 0 END`),
			desc(mediaRevisions.version),
		)
		.limit(1);
	return rows[0] ? toMedia(rows[0].asset, rows[0].revision) : null;
}

export async function getLiveMediaByFilename(
	filename: string,
): Promise<Media | null> {
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaAssets)
		.innerJoin(mediaRevisions, eq(mediaRevisions.assetId, mediaAssets.id))
		.where(
			and(eq(mediaAssets.filename, filename), eq(mediaRevisions.state, 'live')),
		)
		.orderBy(desc(mediaRevisions.version))
		.limit(1);
	return rows[0] ? toMedia(rows[0].asset, rows[0].revision) : null;
}

export async function getLiveMediaById(assetId: number): Promise<Media | null> {
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaAssets)
		.innerJoin(mediaRevisions, eq(mediaRevisions.assetId, mediaAssets.id))
		.where(and(eq(mediaAssets.id, assetId), eq(mediaRevisions.state, 'live')))
		.orderBy(desc(mediaRevisions.version))
		.limit(1);
	return rows[0] ? toMedia(rows[0].asset, rows[0].revision) : null;
}

export async function getMediaById(assetId: number): Promise<Media | null> {
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaAssets)
		.innerJoin(mediaRevisions, eq(mediaRevisions.assetId, mediaAssets.id))
		.where(eq(mediaAssets.id, assetId))
		.orderBy(
			desc(sql`CASE WHEN ${mediaRevisions.state} = 'live' THEN 1 ELSE 0 END`),
			desc(mediaRevisions.version),
		)
		.limit(1);
	return rows[0] ? toMedia(rows[0].asset, rows[0].revision) : null;
}

export async function getMediaRevisionById(
	revisionId: number,
): Promise<MediaRevision | null> {
	const rows = await db
		.select({ asset: mediaAssets, revision: mediaRevisions })
		.from(mediaRevisions)
		.innerJoin(mediaAssets, eq(mediaAssets.id, mediaRevisions.assetId))
		.where(eq(mediaRevisions.id, revisionId))
		.limit(1);
	return rows[0] ? toMediaRevision(rows[0].asset, rows[0].revision) : null;
}

export async function getExistingMediaIds(
	assetIds: number[],
): Promise<number[]> {
	if (assetIds.length === 0) return [];
	const found: number[] = [];
	for (let i = 0; i < assetIds.length; i += 90) {
		const rows = await db
			.select({ id: mediaAssets.id })
			.from(mediaAssets)
			.where(inArray(mediaAssets.id, assetIds.slice(i, i + 90)));
		found.push(...rows.map(row => row.id));
	}
	return found;
}

export async function markMediaArchived(revisionId: number): Promise<void> {
	await db
		.update(mediaRevisions)
		.set({ state: 'archived' })
		.where(eq(mediaRevisions.id, revisionId));
}

export async function markMediaLive(revisionId: number): Promise<void> {
	const revision = await getMediaRevisionById(revisionId);
	if (!revision) return;
	await db.batch([
		db
			.update(mediaRevisions)
			.set({ state: 'archived' })
			.where(
				and(
					eq(mediaRevisions.assetId, revision.assetId),
					eq(mediaRevisions.state, 'live'),
				),
			),
		db
			.update(mediaRevisions)
			.set({ state: 'live' })
			.where(eq(mediaRevisions.id, revisionId)),
	]);
}

export async function deleteMediaByFilename(filename: string): Promise<void> {
	await db.delete(mediaAssets).where(eq(mediaAssets.filename, filename));
}

export async function deleteMediaById(revisionId: number): Promise<void> {
	const revision = await getMediaRevisionById(revisionId);
	if (!revision) return;
	if (revision.state !== 'live') {
		await db.delete(mediaRevisions).where(eq(mediaRevisions.id, revisionId));
		return;
	}

	const [latest] = await db
		.select({ id: mediaRevisions.id })
		.from(mediaRevisions)
		.where(
			and(
				eq(mediaRevisions.assetId, revision.assetId),
				ne(mediaRevisions.id, revisionId),
			),
		)
		.orderBy(desc(mediaRevisions.version))
		.limit(1);
	if (!latest) {
		await db.delete(mediaRevisions).where(eq(mediaRevisions.id, revisionId));
		return;
	}

	await db.batch([
		db.delete(mediaRevisions).where(eq(mediaRevisions.id, revisionId)),
		db
			.update(mediaRevisions)
			.set({ state: 'live' })
			.where(eq(mediaRevisions.id, latest.id)),
	]);
}
