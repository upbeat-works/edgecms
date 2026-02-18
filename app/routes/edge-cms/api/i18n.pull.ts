import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import { getLanguages, getTranslations } from '~/utils/db.server';
import type { Route } from './+types/i18n.pull';

/**
 * GET /edge-cms/api/i18n/pull
 *
 * Fetches all translations for all locales.
 * Query params:
 *   - version: 'draft' | 'live' (default: 'live') - which version to pull from
 *
 * Response:
 * {
 *   languages: [{ locale: string, default: boolean }],
 *   defaultLocale: string,
 *   translations: { [locale]: { [key]: value } }
 * }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	const url = new URL(request.url);
	const version = url.searchParams.get('version') || 'live';

	// For now, we always pull from the database (draft state)
	// In the future, we could pull from R2 for live version
	if (version === 'live') {
		// TODO: Could fetch from R2 bucket for published translations
		// For now, just use database which represents the latest draft
	}

	const [languages, allTranslations] = await Promise.all([
		getLanguages(),
		getTranslations({}),
	]);

	const defaultLocale = languages.find(l => l.default)?.locale || null;

	// Group translations by locale
	const translationsByLocale: Record<string, Record<string, string>> = {};

	for (const lang of languages) {
		translationsByLocale[lang.locale] = {};
	}

	for (const translation of allTranslations) {
		if (!translationsByLocale[translation.language]) {
			translationsByLocale[translation.language] = {};
		}
		translationsByLocale[translation.language][translation.key] =
			translation.value;
	}

	return Response.json({
		languages,
		defaultLocale,
		translations: translationsByLocale,
	});
}
