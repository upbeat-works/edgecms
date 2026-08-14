import { legalDocumentMarkdownResponse } from '~/utils/legal-public.server';

export async function loader({
	params,
	request,
}: {
	params: { slug: string; locale: string };
	request: Request;
}) {
	return legalDocumentMarkdownResponse({
		slug: params.slug,
		locale: params.locale,
		request,
	});
}
