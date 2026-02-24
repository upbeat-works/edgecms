import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	getBlockCollectionByName,
	getLatestVersion,
	createVersion,
	importBlockItems,
	getLanguages,
} from '~/utils/db.server';
import type { Route } from './+types/blocks.import';

const importSchema = z.object({
	collection: z.string().min(1, 'collection is required'),
	items: z
		.array(z.record(z.string(), z.unknown()))
		.min(1, 'items must be a non-empty array'),
	locale: z.string().min(1, 'locale is required'),
});

/**
 * POST /edge-cms/api/blocks/import
 *
 * Bulk-import block instances into a collection.
 * Body (JSON):
 * {
 *   collection: string,             // Required: collection name
 *   items: Record<string, unknown>[], // Required: array of items matching schema properties
 *   locale: string                  // Required: locale for translation values
 * }
 *
 * Response:
 * { success: true, instancesCreated: number }
 */
export async function action({ request }: Route.ActionArgs) {
	const apiKeyResult = await requireApiKey(request, env);

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

	const result = importSchema.safeParse(rawBody);
	if (!result.success) {
		const firstIssue = result.error.issues[0];
		return Response.json(
			{
				error: firstIssue.message,
				code: 'VALIDATION_ERROR',
				path: firstIssue.path.join('.'),
			},
			{ status: 400 },
		);
	}

	const { collection: collectionName, items, locale } = result.data;

	// Verify the locale exists
	const languages = await getLanguages();
	const localeExists = languages.some(l => l.locale === locale);

	if (!localeExists) {
		return Response.json(
			{
				error: `Locale "${locale}" does not exist. Available locales: ${languages.map(l => l.locale).join(', ')}`,
				code: 'LOCALE_NOT_FOUND',
			},
			{ status: 400 },
		);
	}

	// Look up collection by name
	const collection = await getBlockCollectionByName(collectionName);
	if (!collection) {
		return Response.json(
			{
				error: `Collection "${collectionName}" not found`,
				code: 'COLLECTION_NOT_FOUND',
			},
			{ status: 404 },
		);
	}

	// Ensure a draft version exists for translations
	const [draftVersion, liveVersion] = await Promise.all([
		getLatestVersion('draft'),
		getLatestVersion('live'),
	]);

	if (draftVersion == null) {
		const description = liveVersion
			? `fork from v${liveVersion.id}`
			: new Date().toISOString().split('T')[0];
		await createVersion(description, apiKeyResult.key.userId);
	}

	const instancesCreated = await importBlockItems(collection.id, items, locale);

	return Response.json({
		success: true,
		instancesCreated,
	});
}
