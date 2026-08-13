import { getPublishedLegalPublicKeys } from '~/utils/db.server';
import type { Route } from './+types/legal-keys';

export async function loader(_args: Route.LoaderArgs) {
	return Response.json(
		{ keys: await getPublishedLegalPublicKeys() },
		{
			headers: {
				'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
			},
		},
	);
}
