import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	renameMedia,
	toMediaResource,
	uploadMedia,
} from '~/utils/services/media.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/media.$id';

export async function action({ request, params }: Route.ActionArgs) {
	await requireApiKey(request, env);
	if (request.method !== 'PUT' && request.method !== 'PATCH') {
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
	if (request.method === 'PATCH') {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
				{ status: 400 },
			);
		}
		if (
			typeof body !== 'object' ||
			body == null ||
			!('filename' in body) ||
			typeof body.filename !== 'string'
		) {
			return Response.json(
				{ error: 'filename must be a string', code: 'VALIDATION_ERROR' },
				{ status: 400 },
			);
		}
		const result = await renameMedia(id, body.filename);
		return result.ok
			? Response.json(toMediaResource(request, result.data))
			: toResponse(result);
	}

	const result = await uploadMedia(request, { replaceMediaId: id });
	return result.ok
		? Response.json(toMediaResource(request, result.data))
		: toResponse(result);
}
