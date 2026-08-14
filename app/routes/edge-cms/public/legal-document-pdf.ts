import { legalDocumentPdfResponse } from '~/utils/legal-public.server';
import type { Route } from './+types/legal-document-pdf';

export async function loader({ params, request }: Route.LoaderArgs) {
	return legalDocumentPdfResponse({
		slug: params.slug,
		locale: params.locale,
		request,
	});
}
