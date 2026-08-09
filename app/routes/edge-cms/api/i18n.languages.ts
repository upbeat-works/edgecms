import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	createLanguage,
	deleteLanguage,
	listLanguages,
	setDefaultLanguage,
} from '~/utils/services/languages.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/i18n.languages';

const createSchema = z.object({
	locale: z.string().min(1, 'locale is required'),
	default: z.boolean().optional(),
});

const setDefaultSchema = z.object({
	locale: z.string().min(1, 'locale is required'),
});

/**
 * GET /edge-cms/api/i18n/languages
 *
 * Returns available languages.
 *
 * Response:
 * {
 *   languages: [{ locale: string, default: boolean }],
 *   defaultLocale: string | null
 * }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	return toResponse(await listLanguages());
}

/**
 * POST /edge-cms/api/i18n/languages
 *
 * Creates a language. The first language created is always the default.
 * Body: { locale: string, default?: boolean }
 * Response: 201 { locale: string, default: boolean }
 *
 * PATCH /edge-cms/api/i18n/languages
 *
 * Marks an existing language as the default.
 * Body: { locale: string }
 * Response: 200 { locale: string, default: true }
 *
 * DELETE /edge-cms/api/i18n/languages
 *
 * Deletes a non-default language and its translations.
 * Body: { locale: string }
 * Response: 200 { locale: string }
 */
export async function action({ request }: Route.ActionArgs) {
	const { key } = await requireApiKey(request, env);

	if (
		request.method !== 'POST' &&
		request.method !== 'PATCH' &&
		request.method !== 'DELETE'
	) {
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

	const schema = request.method === 'POST' ? createSchema : setDefaultSchema;
	const parsed = schema.safeParse(rawBody);
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

	if (request.method === 'PATCH') {
		return toResponse(
			await setDefaultLanguage(parsed.data.locale, { userId: key.userId }),
		);
	}

	if (request.method === 'DELETE') {
		return toResponse(
			await deleteLanguage(parsed.data.locale, { userId: key.userId }),
		);
	}

	const body = parsed.data as z.infer<typeof createSchema>;
	return toResponse(
		await createLanguage(body.locale, {
			makeDefault: body.default,
			userId: key.userId,
		}),
		201,
	);
}
