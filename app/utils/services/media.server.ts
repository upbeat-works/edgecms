import { env } from 'cloudflare:workers';
import { parseFormData } from '@remix-run/form-data-parser';
import {
	createMedia,
	getLatestMediaVersions,
	getMedia,
	getMediaById,
	markMediaArchived,
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
}

function canonicalUrl(request: Request, filename: string): string {
	const url = new URL(request.url);
	const apiIndex = url.pathname.indexOf('/api/');
	const root = apiIndex === -1 ? '/edge-cms' : url.pathname.slice(0, apiIndex);
	url.pathname = `${root}/public/media/${encodeURIComponent(filename)}`;
	url.search = '';
	return url.toString();
}

export function toMediaResource(request: Request, item: Media): MediaResource {
	return {
		...item,
		uploadedAt: item.uploadedAt.toISOString(),
		canonicalUrl: canonicalUrl(request, item.filename),
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
		version = existing.version + 1;
	}

	try {
		const formData = await parseFormData(
			request,
			{ maxFileSize: 50 * 1024 * 1024, maxFiles: 1 },
			async file => {
				if (file.fieldName !== 'file') return null;
				const filename = existing?.filename ?? sanitizeFilename(file.name);
				await env.MEDIA_BUCKET.put(
					buildVersionedFilename(filename, version),
					file.stream(),
					{
						httpMetadata: {
							contentType: file.type || 'application/octet-stream',
						},
					},
				);
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
		return err('UPLOAD_FAILED', (error as Error).message, 400);
	}
}
