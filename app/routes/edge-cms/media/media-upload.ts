import { env } from 'cloudflare:workers';
import { requireAuth } from '~/utils/auth.middleware';
import { parseFormData } from '@remix-run/form-data-parser';
import {
	getMediaById,
	markMediaArchived,
	createMedia,
} from '~/utils/db.server';
import { sanitizeFilename, buildVersionedFilename } from '~/utils/media.server';
import type { Route } from './+types/media-upload';

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	// Get critical parameters from URL to avoid dependency on form field order
	const url = new URL(request.url);
	const intent = url.searchParams.get('intent');
	const mediaIdParam = url.searchParams.get('mediaId');

	if (!intent) {
		return { error: 'Intent parameter is required in URL' };
	}

	try {
		// Pre-fetch data needed for upload handler
		let existingMedia: any = null;
		let existingFilename: string | undefined;
		let version = 1;

		if (intent === 'replace') {
			if (!mediaIdParam) {
				throw new Error('Media ID parameter is required for replace');
			}

			const mediaId = parseInt(mediaIdParam);

			existingMedia = await getMediaById(mediaId);
			if (!existingMedia) {
				return { error: 'Media not found' };
			}

			// Archive existing media before upload starts
			await markMediaArchived(existingMedia.id);
			existingFilename = existingMedia.filename;
			version = existingMedia.version + 1;
		}

		// Create upload handler that streams directly to final location
		const uploadHandler = async (file: any) => {
			if (file.fieldName !== 'file') {
				return null;
			}

			// Determine final filename
			const filename = existingFilename || sanitizeFilename(file.name);
			const versionedFilename = buildVersionedFilename(filename, version);

			// Stream directly to final location in R2
			await env.MEDIA_BUCKET.put(versionedFilename, file.stream(), {
				httpMetadata: {
					contentType: file.type || 'application/octet-stream',
				},
			});

			// Return metadata about the uploaded file
			return JSON.stringify({
				filename,
				versionedFilename,
				size: file.size,
				type: file.type || 'application/octet-stream',
				version,
			});
		};

		// Parse form data with streaming upload
		const formData = await parseFormData(
			request,
			{
				maxFileSize: 50 * 1024 * 1024, // 50MB - something larger should be handled by a special platform
				maxFiles: 1,
			},
			uploadHandler,
		);

		// Get section from form data (this is fine since it's not critical for the upload)
		const section = formData.get('section') as string | null;
		const fileMetadata = formData.get('file') as string;

		if (!fileMetadata) {
			return { error: 'No file uploaded' };
		}

		const parsedFile = JSON.parse(fileMetadata);

		// Store metadata in D1
		const created = await createMedia({
			filename: parsedFile.filename,
			mimeType: parsedFile.type,
			sizeBytes: parsedFile.size,
			section: section || existingMedia?.section || undefined,
			version: parsedFile.version,
		});

		return { success: true, id: created.id };
	} catch (error) {
		return { error: (error as Error).message };
	}
}
