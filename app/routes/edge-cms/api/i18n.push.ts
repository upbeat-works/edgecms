import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireApiKey } from '~/utils/auth.middleware';
import { getCatalogueRevision } from '~/utils/catalogue-revision';
import { ensureDraftVersion } from '~/utils/ensure-draft-version.server';
import {
	bulkUpsertTranslations,
	getLanguages,
	getTranslations,
} from '~/utils/db.server';
import type { Route } from './+types/i18n.push';

const pushSchema = z.object({
	locale: z.string().min(1, 'locale is required'),
	translations: z.record(z.string(), z.string()),
	baseRevision: z.string().min(1, 'baseRevision is required'),
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
 *   baseRevision: string,     // Required: revision returned by pull
 *   section?: string          // Optional: section to assign keys to
 * }
 *
 * Response:
 * { success: true, keysUpdated: number, revision: string }
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

	const { locale, translations, baseRevision, section } = result.data;

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

	const defaultLocale = languages.find(language => language.default)?.locale;
	if (locale !== defaultLocale) {
		return Response.json(
			{
				error: `Locale "${locale}" is not the CMS default locale. Configure the CLI to push "${defaultLocale}".`,
				code: 'DEFAULT_LOCALE_MISMATCH',
				defaultLocale,
			},
			{ status: 409 },
		);
	}

	const currentTranslations = Object.fromEntries(
		(await getTranslations({ language: locale })).map(translation => [
			translation.key,
			translation.value,
		]),
	);
	const currentRevision = await getCatalogueRevision(currentTranslations);

	if (baseRevision !== currentRevision) {
		return Response.json(
			{
				error:
					'The CMS catalogue changed since this file was pulled. Preserve your local edits, pull the draft, then reconcile the changes before pushing again.',
				code: 'CATALOGUE_CONFLICT',
			},
			{ status: 409 },
		);
	}

	await ensureDraftVersion(apiKeyResult.key.userId);
	await bulkUpsertTranslations(locale, translations, { section });

	const keysUpdated = Object.keys(translations).length;
	const revision = await getCatalogueRevision({
		...currentTranslations,
		...translations,
	});

	return Response.json({
		success: true,
		keysUpdated,
		locale,
		section: section ?? null,
		revision,
	});
}
