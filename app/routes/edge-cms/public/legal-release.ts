import { legalDocumentResponse } from '~/utils/legal-public.server';
import type { Route } from './+types/legal-release';

export async function loader({ params, request }: Route.LoaderArgs) {
	return legalDocumentResponse({
		slug: params.slug,
		locale: params.locale,
		releaseHash: params.releaseHash,
		request,
	});
}
