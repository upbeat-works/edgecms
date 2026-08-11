import { env } from 'cloudflare:workers';
import { requireAuth } from '~/utils/auth.middleware';
import { uploadMedia } from '~/utils/services/media.server';
import type { Route } from './+types/media-upload';

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);
	const url = new URL(request.url);
	const intent = url.searchParams.get('intent');
	if (intent !== 'upload' && intent !== 'replace') {
		return { error: 'Intent parameter must be upload or replace' };
	}
	const mediaId =
		intent === 'replace' ? Number(url.searchParams.get('mediaId')) : undefined;
	if (intent === 'replace' && (!Number.isInteger(mediaId) || mediaId! < 1)) {
		return { error: 'Media ID parameter is required for replace' };
	}
	const result = await uploadMedia(request, { replaceMediaId: mediaId });
	return result.ok
		? { success: true, id: result.data.id }
		: { error: result.error.message };
}
