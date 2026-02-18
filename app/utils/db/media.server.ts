import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { media } from '../schema.server';
import type { Media } from './types';

const db = drizzle(env.DB);

// Media operations
export async function getMedia(options?: {
	section?: string;
	state?: 'live' | 'archived';
	filename?: string;
}): Promise<Media[]> {
	const { section, state, filename } = options || {};

	const filters = [];
	if (section) filters.push(eq(media.section, section));
	if (state) filters.push(eq(media.state, state));
	if (filename) filters.push(eq(media.filename, filename));

	const result = await db
		.select()
		.from(media)
		.where(and(...filters))
		.orderBy(desc(media.uploadedAt));

	return result.map(row => ({
		...row,
		uploadedAt: new Date(row.uploadedAt),
	}));
}

export async function getLatestMediaVersions(options?: {
	section?: string;
	state?: 'live' | 'archived';
}): Promise<(Media & { count: number })[]> {
	const { state } = options || {};

	const bestVersions = db
		.select({
			filename: media.filename,
			count: sql<number>`COUNT(*)`.as('version_count'),
			bestVersion: sql<number>`
				COALESCE(
					MAX(CASE WHEN state = 'live' THEN version END),
					MAX(version)
				)
			`.as('best_version'),
		})
		.from(media)
		.groupBy(media.filename)
		.as('best_versions');

	const filters = [];
	if (state) filters.push(eq(media.state, state));

	const result = await db
		.select({
			media: media,
			count: bestVersions.count,
		})
		.from(media)
		.innerJoin(
			bestVersions,
			and(
				eq(media.filename, bestVersions.filename),
				eq(media.version, bestVersions.bestVersion),
			),
		)
		.where(and(...filters));

	return result.map(row => ({
		...row.media,
		uploadedAt: new Date(row.media.uploadedAt),
		count: row.count,
	}));
}

export async function createMedia(props: {
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section?: string;
	version?: number;
}) {
	const result = await db
		.insert(media)
		.values({
			filename: props.filename,
			mimeType: props.mimeType,
			sizeBytes: props.sizeBytes,
			section: props.section || null,
			version: props.version,
		})
		.returning();

	return result[0];
}

export async function updateMediaSection(
	mediaId: number,
	section: string | null,
) {
	await db.update(media).set({ section }).where(eq(media.id, mediaId));
}

export async function getMediaByFilename(
	filename: string,
	version?: number,
): Promise<Media | null> {
	const filters = [eq(media.filename, filename)];
	if (version) filters.push(eq(media.version, version));

	const result = await db
		.select()
		.from(media)
		.where(and(...filters))
		.orderBy(desc(media.version))
		.limit(1);
	if (result.length === 0) return null;

	return {
		...result[0],
		uploadedAt: new Date(result[0].uploadedAt),
	};
}

export async function getMediaById(mediaId: number): Promise<Media | null> {
	const result = await db.select().from(media).where(eq(media.id, mediaId));
	if (result.length === 0) return null;

	return {
		...result[0],
		uploadedAt: new Date(result[0].uploadedAt),
	};
}

export async function markMediaArchived(mediaId: number): Promise<void> {
	await db
		.update(media)
		.set({ state: 'archived' as any })
		.where(eq(media.id, mediaId));
}

export async function markMediaLive(mediaId: number): Promise<void> {
	const result = await db.select().from(media).where(eq(media.id, mediaId));
	if (result.length === 0) return;
	const archived = result[0];

	await db
		.update(media)
		.set({ state: 'archived' })
		.where(and(eq(media.filename, archived.filename), eq(media.state, 'live')));

	await db
		.update(media)
		.set({ state: 'live' as any })
		.where(eq(media.id, mediaId));
}

export async function deleteMediaByFilename(filename: string): Promise<void> {
	await db.delete(media).where(eq(media.filename, filename));
}

export async function deleteMediaById(mediaId: number): Promise<void> {
	const file = await getMediaById(mediaId);
	if (!file) return;
	await db.delete(media).where(eq(media.id, mediaId));

	if (file.state === 'live') {
		const latestVersion = await db
			.select()
			.from(media)
			.where(eq(media.filename, file.filename))
			.orderBy(desc(media.version))
			.limit(1);
		if (latestVersion.length > 0) {
			await db
				.update(media)
				.set({ state: 'live' })
				.where(eq(media.id, latestVersion[0].id));
		}
	}
}
