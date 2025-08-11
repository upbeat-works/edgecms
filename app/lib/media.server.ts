import {
	createMedia,
	markMediaArchived,
	deleteMediaById,
	getMediaByFilename,
	getMediaById,
} from '~/lib/db.server';
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

export async function uploadMedia(
	file: File,
	props: {
		section?: string;
		filename?: string;
		version?: number;
	},
): Promise<{ id: number; filename: string; url: string }> {
	const filename = props.filename ?? sanitizeFilename(file.name);
	const versionedFilename = buildVersionedFilename(filename, props.version);

	// Upload to R2
	await env.MEDIA_BUCKET.put(versionedFilename, file.stream(), {
		httpMetadata: {
			contentType: file.type,
		},
	});

	// Store metadata in D1
	const created = await createMedia({
		filename,
		mimeType: file.type,
		sizeBytes: file.size,
		section: props.section,
		version: props.version,
	});

	// Return the filename for reference
	return {
		id: created.id,
		filename,
		url: `/edge-cms/public/media/${filename}`,
	};
}

export async function replaceDocument(
	mediaId: number,
	file: File,
	section?: string,
): Promise<{ id: number; filename: string; url: string }> {
	const existing = await getMediaById(mediaId);
	if (!existing) {
		throw new Error(`Media with id ${mediaId} not found`);
	}
	await markMediaArchived(existing.id);
	const version = existing.version + 1;
	const created = await uploadMedia(file, {
		version,
		filename: existing.filename,
		section: section ?? existing.section ?? undefined,
	});
	return created;
}

export async function deleteDocument(mediaId: number): Promise<void> {
	const existing = await getMediaById(mediaId);
	if (!existing) return;

	await env.MEDIA_BUCKET.delete(existing.filename);
	await deleteMediaById(existing.id);
}
