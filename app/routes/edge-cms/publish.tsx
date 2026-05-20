import type { Route } from './+types/publish';
import { env } from 'cloudflare:workers';
import { requireAuth } from '~/utils/auth.middleware';
import { releaseDraft } from '~/utils/db.server';

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);
	const publishId = await releaseDraft();
	return { success: true, publishId };
}
