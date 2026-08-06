import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	applyBlockSchema,
	listBlockSchemas,
} from '~/utils/services/blocks.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/blocks.schemas';

const propertySchema = z.object({
	name: z.string().min(1, 'property name is required'),
	type: z.enum([
		'string',
		'number',
		'translation',
		'media',
		'boolean',
		'block',
		'collection',
	]),
	refSchema: z.string().optional(),
	description: z.string().optional(),
});

const applySchema = z.object({
	name: z.string().min(1, 'name is required'),
	properties: z.array(propertySchema).default([]),
});

/**
 * GET /edge-cms/api/blocks/schemas
 *
 * Lists block schemas and their properties.
 *
 * Response:
 * { schemas: [{ name, properties: [{ name, type, refSchema, description }] }] }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	return toResponse(await listBlockSchemas());
}

/**
 * POST /edge-cms/api/blocks/schemas
 *
 * Creates a schema, or adds any declared properties it is missing. Additive
 * only: properties that exist but aren't declared are left alone, and a
 * declared property that contradicts an existing one is refused rather than
 * rewritten.
 *
 * Body: { name: string, properties?: [{ name, type, refSchema?, description? }] }
 * Response: 201 (created) / 200 (already existed)
 *   { name, created, propertiesAdded, properties }
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

	const parsed = applySchema.safeParse(rawBody);
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

	const result = await applyBlockSchema(
		parsed.data.name,
		parsed.data.properties,
		{
			userId: key.userId,
		},
	);

	return toResponse(result, result.ok && result.data.created ? 201 : 200);
}
