import { env } from 'cloudflare:workers';
import { parseFormData } from '@remix-run/form-data-parser';
import {
	createMedia,
	getLatestMediaVersions,
	getMedia,
	getMediaById,
	markMediaArchived,
	renameMediaVersions,
} from '../db/index.server';
import { buildVersionedFilename, sanitizeFilename } from '../media.server';
import { err, ok, type ServiceResult } from './result';
import type { Media } from '../db/types';

export interface MediaResource {
	id: number;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section: string | null;
	state: 'live' | 'archived';
	uploadedAt: string;
	version: number;
	canonicalUrl: string;
	revisionUrl: string;
}

function edgeCmsRoot(request: Request): string {
	const url = new URL(request.url);
	const apiIndex = url.pathname.indexOf('/api/');
	if (apiIndex !== -1) return url.pathname.slice(0, apiIndex);

	const publicIndex = url.pathname.indexOf('/public/');
	if (publicIndex !== -1) return url.pathname.slice(0, publicIndex);
	return '/edge-cms';
}

function canonicalUrl(request: Request, filename: string): string {
	const url = new URL(request.url);
	const root = edgeCmsRoot(request);
	url.pathname = `${root}/public/media/${encodeURIComponent(filename)}`;
	url.search = '';
	return url.toString();
}

export function mediaRevisionUrl(request: Request, item: Media): string {
	const url = new URL(request.url);
	const root = edgeCmsRoot(request);
	url.pathname = `${root}/public/media/revisions/${item.id}/${encodeURIComponent(item.filename)}`;
	url.search = '';
	return url.toString();
}

export function toMediaResource(request: Request, item: Media): MediaResource {
	return {
		...item,
		uploadedAt: item.uploadedAt.toISOString(),
		canonicalUrl: canonicalUrl(request, item.filename),
		revisionUrl: mediaRevisionUrl(request, item),
	};
}

export async function listMedia(options: {
	search?: string;
	section?: string;
	state?: 'live' | 'archived';
	allVersions?: boolean;
}): Promise<Media[]> {
	const items = options.allVersions
		? await getMedia()
		: await getLatestMediaVersions();
	const search = options.search?.toLocaleLowerCase();

	return items.filter(item => {
		if (search && !item.filename.toLocaleLowerCase().includes(search))
			return false;
		if (options.section && item.section !== options.section) return false;
		if (options.state && item.state !== options.state) return false;
		return true;
	});
}

export async function uploadMedia(
	request: Request,
	options: { replaceMediaId?: number } = {},
): Promise<ServiceResult<Media>> {
	let existing: Media | null = null;
	let version = 1;

	if (options.replaceMediaId != null) {
		existing = await getMediaById(options.replaceMediaId);
		if (!existing) {
			return err(
				'MEDIA_NOT_FOUND',
				`Media ${options.replaceMediaId} not found`,
				404,
			);
		}
		const revisions = await getMedia({ filename: existing.filename });
		version = Math.max(...revisions.map(revision => revision.version)) + 1;
	}

	let storedKey: string | null = null;
	let storedNewObject = false;
	try {
		const formData = await parseFormData(
			request,
			{ maxFileSize: 50 * 1024 * 1024, maxFiles: 1 },
			async file => {
				if (file.fieldName !== 'file') return null;
				const filename = existing?.filename ?? sanitizeFilename(file.name);
				storedKey = buildVersionedFilename(filename, version);
				const stored = await env.MEDIA_BUCKET.put(storedKey, file.stream(), {
					onlyIf: { etagDoesNotMatch: '*' },
					httpMetadata: {
						contentType: file.type || 'application/octet-stream',
					},
				});
				if (!stored)
					throw new Error(`Media revision ${version} already exists`);
				storedNewObject = true;
				return JSON.stringify({
					filename,
					mimeType: file.type || 'application/octet-stream',
					sizeBytes: file.size,
				});
			},
		);
		const metadata = formData.get('file');
		if (typeof metadata !== 'string') {
			return err('FILE_REQUIRED', 'No file uploaded', 400);
		}
		const file = JSON.parse(metadata) as {
			filename: string;
			mimeType: string;
			sizeBytes: number;
		};
		if (existing) await markMediaArchived(existing.id);
		const section = formData.get('section');
		const created = await createMedia({
			...file,
			section:
				typeof section === 'string' && section !== ''
					? section
					: (existing?.section ?? undefined),
			version,
		});
		return ok({ ...created, uploadedAt: new Date(created.uploadedAt) });
	} catch (error) {
		if (storedNewObject && storedKey != null) {
			await env.MEDIA_BUCKET.delete(storedKey);
		}
		return err('UPLOAD_FAILED', (error as Error).message, 400);
	}
}

export async function renameMedia(
	mediaId: number,
	requestedFilename: string,
): Promise<ServiceResult<Media>> {
	const existing = await getMediaById(mediaId);
	if (!existing) {
		return err('MEDIA_NOT_FOUND', `Media ${mediaId} not found`, 404);
	}

	const filename = sanitizeFilename(requestedFilename);
	if (!filename || filename.startsWith('.')) {
		return err('VALIDATION_ERROR', 'Filename must include a name', 400);
	}
	if (filename === existing.filename) return ok(existing);

	const conflict = await getMedia({ filename });
	if (conflict.length > 0) {
		return err(
			'MEDIA_FILENAME_EXISTS',
			`Media filename "${filename}" already exists`,
			409,
		);
	}

	const versions = await getMedia({ filename: existing.filename });
	const objects = versions.map(version => ({
		oldKey: buildVersionedFilename(existing.filename, version.version),
		newKey: buildVersionedFilename(filename, version.version),
	}));
	const locations = await Promise.all(
		objects.map(async object => ({
			...object,
			source: await env.MEDIA_BUCKET.head(object.oldKey),
			destination: await env.MEDIA_BUCKET.head(object.newKey),
		})),
	);
	const missing = locations.find(object => object.source == null);
	if (missing) {
		return err(
			'MEDIA_REVISION_MISSING',
			`Stored media revision "${missing.oldKey}" is missing`,
			409,
		);
	}
	if (locations.some(object => object.destination != null)) {
		return err(
			'MEDIA_FILENAME_EXISTS',
			`Stored objects already exist for filename "${filename}"`,
			409,
		);
	}

	const copiedKeys: string[] = [];
	try {
		for (const object of objects) {
			const source = await env.MEDIA_BUCKET.get(object.oldKey);
			if (!source) {
				throw new Error(`Stored media revision "${object.oldKey}" is missing`);
			}
			await env.MEDIA_BUCKET.put(object.newKey, source.body, {
				httpMetadata: source.httpMetadata,
				customMetadata: source.customMetadata,
			});
			copiedKeys.push(object.newKey);
		}
		await renameMediaVersions(existing.filename, filename);
	} catch (error) {
		if (copiedKeys.length > 0) await env.MEDIA_BUCKET.delete(copiedKeys);
		return err('MEDIA_RENAME_FAILED', (error as Error).message, 500);
	}

	try {
		await env.MEDIA_BUCKET.delete(objects.map(object => object.oldKey));
	} catch (error) {
		console.error('Failed to remove media objects after rename', error);
	}

	return ok({ ...existing, filename });
}
