import { deleteMediaByFilename, getMediaById } from '~/lib/db.server';
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

export async function deleteDocument(mediaId: number): Promise<void> {
	const existing = await getMediaById(mediaId);
	if (!existing) return;

	await env.MEDIA_BUCKET.delete(existing.filename);
	await deleteMediaByFilename(existing.filename);
}
