import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	assignContentToSection,
	createSection,
	deleteSection,
	listSections,
	renameSection,
} from '~/utils/services/sections.server';
import { toResponse } from '~/utils/services/result';

const createSchema = z.object({ name: z.string() });
const renameSchema = z.object({ name: z.string(), newName: z.string() });
const assignSchema = z
	.object({
		name: z.string(),
		translationKeys: z.array(z.string()).optional(),
		mediaIds: z.array(z.number().int().positive()).optional(),
	})
	.refine(
		body =>
			(body.translationKeys?.length ?? 0) > 0 ||
			(body.mediaIds?.length ?? 0) > 0,
		{ message: 'Provide at least one i18n key or media ID' },
	);
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

	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
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

	let schema: z.ZodType = deleteSchema;
	if (request.method === 'POST') schema = createSchema;
	if (request.method === 'PUT') schema = assignSchema;
	if (request.method === 'PATCH') schema = renameSchema;
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
	if (request.method === 'PUT') {
		const body = parsed.data as z.infer<typeof assignSchema>;
		return toResponse(
			await assignContentToSection(body.name, {
				translationKeys: body.translationKeys,
				mediaIds: body.mediaIds,
			}),
		);
	}

	const body = parsed.data as z.infer<typeof deleteSchema>;
	return toResponse(await deleteSection(body.name, { dryRun: body.dryRun }));
}
