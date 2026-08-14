import { legalDocumentResponse } from '~/utils/legal-public.server';
import type { Route } from './+types/legal-document';

export async function loader({ params, request }: Route.LoaderArgs) {
	return legalDocumentResponse({
		slug: params.slug,
		locale: params.locale,
		request,
	});
}
