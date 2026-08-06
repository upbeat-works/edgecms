import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import { toResponse } from '~/utils/services/result';
import { getMissingTranslations } from '~/utils/services/translations.server';
import type { Route } from './+types/i18n.missing';

/**
 * GET /edge-cms/api/i18n/missing[?locale=es]
 *
 * Reports keys that exist in the default locale but are absent or empty in a
 * target locale. Without `locale`, reports every non-default locale.
 *
 * Intended as a CI gate: fail the build when `totalMissing > 0`.
 *
 * Response:
 * {
 *   defaultLocale: string,
 *   totalMissing: number,
 *   locales: { [locale]: { missingCount: number, keys: [{ key, section, defaultValue }] } }
 * }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	const locale = new URL(request.url).searchParams.get('locale') ?? undefined;

	return toResponse(await getMissingTranslations(locale));
}
