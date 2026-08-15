import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import { createLegalDocumentDraft } from '~/utils/services/legal.server';
import { toResponse } from '~/utils/services/result';

const createSchema = z.object({
	name: z.string(),
	slug: z.string().optional(),
	type: z.enum([
		'terms_and_conditions',
		'privacy_policy',
		'cookie_policy',
		'dpa',
		'other',
	]),
	locale: z.string(),
	markdown: z.string(),
});

export async function action({ request }: { request: Request }) {
	const apiKey = await requireApiKey(request, env);

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

	const body = parsed.data;
	return toResponse(
		await createLegalDocumentDraft({
			name: body.name,
			slug: body.slug ?? body.name,
			type: body.type,
			locale: body.locale,
			markdown: body.markdown,
			userId: apiKey.key.userId,
		}),
		201,
	);
}
