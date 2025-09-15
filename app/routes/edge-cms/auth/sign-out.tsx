import type { Route } from './+types/sign-out';
import { createAuth } from '~/utils/auth.server';
import { env } from 'cloudflare:workers';
import { redirect } from 'react-router';

export async function action({ request }: Route.ActionArgs) {
	const auth = createAuth(env);
	const { headers } = await auth.api.signOut({
		headers: request.headers,
		returnHeaders: true,
	});

	return redirect('/edge-cms', { headers });
}
