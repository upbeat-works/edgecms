import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	createSection,
	deleteSection,
	listSections,
	renameSection,
} from '~/utils/services/sections.server';
import { toResponse } from '~/utils/services/result';

const createSchema = z.object({ name: z.string() });
const renameSchema = z.object({ name: z.string(), newName: z.string() });
const deleteSchema = z.object({
	name: z.string(),
	dryRun: z.boolean().optional(),
});

export async function loader({ request }: { request: Request }) {
	await requireApiKey(request, env);

	return toResponse(await listSections());
}

export async function action({ request }: { request: Request }) {
	await requireApiKey(request, env);

	if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
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

	const schema =
		request.method === 'POST'
			? createSchema
			: request.method === 'PATCH'
				? renameSchema
				: deleteSchema;
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

	if (request.method === 'POST') {
		return toResponse(
			await createSection((parsed.data as z.infer<typeof createSchema>).name),
			201,
		);
	}
	if (request.method === 'PATCH') {
		const body = parsed.data as z.infer<typeof renameSchema>;
		return toResponse(await renameSection(body.name, body.newName));
	}

	const body = parsed.data as z.infer<typeof deleteSchema>;
	return toResponse(await deleteSection(body.name, { dryRun: body.dryRun }));
}
