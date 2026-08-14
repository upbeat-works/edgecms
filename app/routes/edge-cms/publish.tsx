import type { Route } from './+types/publish';
import { env } from 'cloudflare:workers';
import { redirect } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
import { releaseDraft } from '~/utils/db.server';

function publishReturnUrl(
	request: Request,
	returnTo: FormDataEntryValue | null,
) {
	const requestUrl = new URL(request.url);
	const fallback = new URL('/edge-cms', requestUrl);
	if (typeof returnTo !== 'string') return fallback;

	const target = new URL(returnTo, requestUrl);
	const isCmsPath =
		target.pathname === '/edge-cms' || target.pathname.startsWith('/edge-cms/');
	if (target.origin !== requestUrl.origin || !isCmsPath) return fallback;

	target.hash = '';
	return target;
}

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);
	const formData = await request.formData();
	const publishId = await releaseDraft();
	const returnUrl = publishReturnUrl(request, formData.get('returnTo'));
	returnUrl.searchParams.set('publishId', publishId);
	return redirect(`${returnUrl.pathname}${returnUrl.search}`);
}
