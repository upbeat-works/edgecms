import {
	deleteMediaByFilename,
	deleteMediaById,
	getMediaById,
	getMediaRevisionById,
	getMedia,
} from '~/utils/db.server';
import { env } from 'cloudflare:workers';

export function buildVersionedFilename(
	filename: string,
	version?: number,
): string {
	if (version && version > 1) {
		return `${filename}-v${version}`;
	}
	return filename;
}

export function sanitizeFilename(filename: string): string {
	// Get file extension
	const lastDotIndex = filename.lastIndexOf('.');
	const extension = lastDotIndex > -1 ? filename.slice(lastDotIndex) : '';
	const nameWithoutExt =
		lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;

	// Convert to kebab-case and preserve extension
	const kebabName = nameWithoutExt
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return kebabName + extension;
}

export async function deleteAllVersions(mediaId: number): Promise<void> {
	const existing = await getMediaById(mediaId);
	if (!existing) return;

	// Get all versions of this file
	const allVersions = await getMedia({ filename: existing.filename });

	await Promise.all(
		allVersions.map(version =>
			env.MEDIA_BUCKET.delete(
				buildVersionedFilename(version.filename, version.version),
			),
		),
	);
	await deleteMediaByFilename(existing.filename);
}

export async function deleteVersion(mediaId: number): Promise<void> {
	const existing = await getMediaRevisionById(mediaId);
	if (!existing) return;

	const versionedFilename = buildVersionedFilename(
		existing.filename,
		existing.version,
	);
	await env.MEDIA_BUCKET.delete(versionedFilename);
	await deleteMediaById(existing.revisionId);
}
