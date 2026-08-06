import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import { deleteTranslationKeys } from '~/utils/services/translations.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/i18n.keys';

/**
 * The whole set is deleted in one transactional batch, so the cap is a sanity
 * bound on the payload rather than a chunking limit.
 */
const MAX_KEYS = 5000;

const deleteSchema = z.object({
	keys: z
		.array(z.string())
		.max(MAX_KEYS, `Cannot delete more than ${MAX_KEYS} keys in one request`),
	dryRun: z.boolean().optional(),
});

/**
 * DELETE /edge-cms/api/i18n/keys
 *
 * Removes translation keys and every locale's value for them.
 *
 * Body: { keys: string[], dryRun?: boolean }
 *
 * `dryRun` defaults to true: a caller has to opt in to the destructive path, so
 * a mistaken or truncated request reports instead of deleting. Keys owned by
 * block instances are never deleted — they are reported under `protected`.
 *
 * Response:
 * { dryRun, requested, deleted: string[], protected: string[], missing: string[] }
 */
export async function action({ request }: Route.ActionArgs) {
	const { key } = await requireApiKey(request, env);

	if (request.method !== 'DELETE') {
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

	const parsed = deleteSchema.safeParse(rawBody);
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

	return toResponse(
		await deleteTranslationKeys(parsed.data.keys, {
			dryRun: parsed.data.dryRun,
			userId: key.userId,
		}),
	);
}
