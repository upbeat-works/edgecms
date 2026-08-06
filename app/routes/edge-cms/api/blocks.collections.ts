import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	createBlockCollection,
	listBlockCollections,
} from '~/utils/services/blocks.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/blocks.collections';

const createSchema = z.object({
	name: z.string().min(1, 'name is required'),
	schema: z.string().min(1, 'schema is required'),
	section: z.string().optional(),
	singleton: z.boolean().optional(),
});

/**
 * GET /edge-cms/api/blocks/collections
 *
 * Lists block collections.
 *
 * Response:
 * { collections: [{ name, schema, section, singleton, instanceCount }] }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	return toResponse(await listBlockCollections());
}

/**
 * POST /edge-cms/api/blocks/collections
 *
 * Creates a collection bound to a schema. Re-creating an identical collection
 * is a no-op, so a declarative document can be applied repeatedly.
 *
 * Body: { name: string, schema: string, section?: string, singleton?: boolean }
 * Response: 201 (created) / 200 (already existed)
 *   { name, schema, section, singleton, created, instanceCount }
 */
export async function action({ request }: Route.ActionArgs) {
	const { key } = await requireApiKey(request, env);

	if (request.method !== 'POST') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return Response.json(
			{ error: 'Invalid JSON body', code: 'INVALID_JSON' },
			{ status: 400 },
		);
	}

	const parsed = createSchema.safeParse(rawBody);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return Response.json(
			{
				error: firstIssue.message,
				code: 'VALIDATION_ERROR',
				path: firstIssue.path.join('.'),
			},
			{ status: 400 },
		);
	}

	const result = await createBlockCollection(parsed.data, {
		userId: key.userId,
	});

	return toResponse(result, result.ok && result.data.created ? 201 : 200);
}
