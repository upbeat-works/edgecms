import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import { setBlockMedia } from '~/utils/services/block-media.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/blocks.media';

const bodySchema = z.object({
	mediaId: z.number().int().positive().nullable(),
});

export async function action({ request, params }: Route.ActionArgs) {
	const { key } = await requireApiKey(request, env);
	if (request.method !== 'PATCH') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json(
			{ error: 'Invalid JSON body', code: 'INVALID_JSON' },
			{ status: 400 },
		);
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' },
			{ status: 400 },
		);
	}
	const instanceId = Number(params.instanceId);
	if (!Number.isInteger(instanceId) || instanceId < 1) {
		return Response.json(
			{ error: 'Invalid instance ID', code: 'VALIDATION_ERROR' },
			{ status: 400 },
		);
	}
	return toResponse(
		await setBlockMedia(
			{
				collection: params.collection,
				instanceId,
				property: params.property,
				mediaId: parsed.data.mediaId,
			},
			{ userId: key.userId },
		),
	);
}
