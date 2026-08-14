import { legalDocumentMarkdownResponse } from '~/utils/legal-public.server';

export async function loader({
	params,
	request,
}: {
	params: { slug: string; locale: string; releaseHash: string };
	request: Request;
}) {
	return legalDocumentMarkdownResponse({
		slug: params.slug,
		locale: params.locale,
		releaseHash: params.releaseHash,
		request,
	});
}
