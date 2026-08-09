import { env } from 'cloudflare:workers';
import { requireApiKey } from '~/utils/auth.middleware';
import { toResponse } from '~/utils/services/result';
import { getStaleTranslations } from '~/utils/services/translations.server';
import type { Route } from './+types/i18n.stale';

/**
 * GET /edge-cms/api/i18n/stale[?locale=es]
 *
 * Reports translations written against a default-locale value that has since
 * changed. Without `locale`, reports every non-default locale.
 *
 * The complement of `/api/i18n/missing`: these keys are translated, just
 * possibly out of date. Usable as a CI gate on `totalStale > 0`.
 *
 * Response:
 * {
 *   defaultLocale: string,
 *   totalStale: number,
 *   locales: { [locale]: { staleCount: number, keys: [{ key, section, defaultValue, currentValue }] } }
 * }
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireApiKey(request, env);

	const locale = new URL(request.url).searchParams.get('locale') ?? undefined;

	return toResponse(await getStaleTranslations(locale));
}
