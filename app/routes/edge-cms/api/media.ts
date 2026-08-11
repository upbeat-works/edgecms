import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	listMedia,
	toMediaResource,
	uploadMedia,
} from '~/utils/services/media.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/media';

export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);
	const url = new URL(request.url);
	const state = url.searchParams.get('state');
	if (state != null && state !== 'live' && state !== 'archived') {
		return Response.json(
			{ error: 'state must be "live" or "archived"', code: 'VALIDATION_ERROR' },
			{ status: 400 },
		);
	}
	const items = await listMedia({
		search: url.searchParams.get('search') ?? undefined,
		section: url.searchParams.get('section') ?? undefined,
		state: state ?? undefined,
		allVersions: url.searchParams.get('allVersions') === 'true',
	});
	return Response.json({
		media: items.map(item => toMediaResource(request, item)),
	});
}

export async function action({ request }: Route.ActionArgs) {
	await requireApiKey(request, env);
	if (request.method !== 'POST') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}
	const result = await uploadMedia(request);
	return result.ok
		? Response.json(toMediaResource(request, result.data), { status: 201 })
		: toResponse(result);
}
