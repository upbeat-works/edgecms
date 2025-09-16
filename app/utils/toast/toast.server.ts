import { createCookieSessionStorage, redirect } from 'react-router';
import { combineHeaders } from '../misc';
import { env } from 'cloudflare:workers';
import { type ToastInput, ToastSchema } from './toast-types';

export const toastKey = 'toast';

export const toastSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'edgecms_toast',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: env.SESSION_SECRET.split(','),
		secure: import.meta.env.PROD,
	},
});

export async function redirectWithToast(
	url: string,
	toast: ToastInput,
	init?: ResponseInit,
) {
	return redirect(url, {
		...init,
		headers: combineHeaders(init?.headers, await createToastHeaders(toast)),
	});
}

export async function createToastHeaders(toastInput: ToastInput) {
	const session = await toastSessionStorage.getSession();
	const toast = ToastSchema.parse(toastInput);
	session.flash(toastKey, toast);
	const cookie = await toastSessionStorage.commitSession(session);
	return new Headers({ 'set-cookie': cookie });
}

export async function getToast(request: Request) {
	const session = await toastSessionStorage.getSession(
		request.headers.get('cookie'),
	);
	const result = ToastSchema.safeParse(session.get(toastKey));
	const toast = result.success ? result.data : null;
	return {
		toast,
		headers: toast
			? new Headers({
					'set-cookie': await toastSessionStorage.destroySession(session),
				})
			: null,
	};
}
