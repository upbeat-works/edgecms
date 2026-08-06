import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	getPublishStatus,
	publishDraft,
} from '~/utils/services/publish.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/publish';

/**
 * GET /edge-cms/api/publish?id=<publishId>
 *
 * Reports the status of a publish started by POST. Statuses come from the
 * release Workflow: queued | running | paused | errored | terminated | complete
 *
 * Response: { publishId: string, status: string, error: string | null }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	const publishId = new URL(request.url).searchParams.get('id');
	if (!publishId) {
		return Response.json(
			{ error: 'Query parameter "id" is required', code: 'VALIDATION_ERROR' },
			{ status: 400 },
		);
	}

	return toResponse(await getPublishStatus(publishId));
}

/**
 * POST /edge-cms/api/publish
 *
 * Releases the current draft version, making it live. Asynchronous: returns a
 * publishId to poll with GET.
 *
 * Response: 202 { publishId: string, versionId: number }
 */
export async function action({ request }: Route.ActionArgs) {
	const { key } = await requireApiKey(request, env);

	if (request.method !== 'POST') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}

	return toResponse(await publishDraft({ userId: key.userId }), 202);
}
