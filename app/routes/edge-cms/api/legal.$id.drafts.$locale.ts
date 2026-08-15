import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import { saveLegalDraft } from '~/utils/services/legal.server';
import { toResponse } from '~/utils/services/result';

const updateSchema = z.object({ markdown: z.string() });

export async function action({
	request,
	params,
}: {
	request: Request;
	params: { id?: string; locale?: string };
}) {
	const apiKey = await requireApiKey(request, env);

	if (request.method !== 'PUT') {
		return Response.json(
			{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
			{ status: 405 },
		);
	}

	const documentId = Number(params.id);
	if (!Number.isInteger(documentId) || documentId < 1 || !params.locale) {
		return Response.json(
			{ error: 'Legal document not found', code: 'LEGAL_DOCUMENT_NOT_FOUND' },
			{ status: 404 },
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

	const parsed = updateSchema.safeParse(rawBody);
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
		await saveLegalDraft({
			documentId,
			locale: params.locale,
			markdown: parsed.data.markdown,
			userId: apiKey.key.userId,
		}),
	);
}
