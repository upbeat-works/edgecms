import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import { toMediaResource, uploadMedia } from '~/utils/services/media.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/media.$id';

export async function action({ request, params }: Route.ActionArgs) {
	await requireApiKey(request, env);
	if (request.method !== 'PUT') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) {
		return Response.json(
			{ error: 'Invalid media ID', code: 'VALIDATION_ERROR' },
			{ status: 400 },
		);
	}
	const result = await uploadMedia(request, { replaceMediaId: id });
	return result.ok
		? Response.json(toMediaResource(request, result.data))
		: toResponse(result);
}
