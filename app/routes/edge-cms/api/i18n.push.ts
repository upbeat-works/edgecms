import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import {
	getLatestVersion,
	createVersion,
	bulkUpsertTranslations,
	getLanguages,
} from '~/utils/db.server';
import type { Route } from './+types/i18n.push';

const pushSchema = z.object({
	locale: z.string().min(1, 'locale is required'),
	translations: z.record(z.string(), z.string()),
	section: z.string().optional(),
});

/**
 * POST /edge-cms/api/i18n/push
 *
 * Uploads translations for a specific locale.
 * Body (JSON):
 * {
 *   locale: string,           // Required: the locale to push (e.g., "en")
 *   translations: { [key]: value }, // Required: key-value map of strings
 *   section?: string          // Optional: section to assign keys to
 * }
 *
 * Response:
 * { success: true, keysUpdated: number }
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

	const result = pushSchema.safeParse(rawBody);
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

	const { locale, translations, section } = result.data;

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

	// Ensure a draft version exists (same pattern as UI import)
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

	// Bulk upsert translations (same function as UI import)
	await bulkUpsertTranslations(locale, translations, section);

	const keysUpdated = Object.keys(translations).length;

	return Response.json({
		success: true,
		keysUpdated,
		locale,
		section: section ?? null,
	});
}
