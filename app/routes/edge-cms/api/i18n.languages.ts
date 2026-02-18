import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import { getLanguages } from '~/utils/db.server';
import type { Route } from './+types/i18n.languages';

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

	const languages = await getLanguages();
	const defaultLocale = languages.find(l => l.default)?.locale || null;

	return Response.json({
		languages,
		defaultLocale,
	});
}
