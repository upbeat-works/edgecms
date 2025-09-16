import { type Session, type User } from 'better-auth';
import { redirect } from 'react-router';
import { createAuth, type Auth } from './auth.server';

export async function requireAuth(
	request: Request,
	env: Env,
): Promise<{ session: Session; user: User; auth: Auth }> {
	const auth = createAuth(env);

	const result = await auth.api.getSession({
		headers: request.headers,
	});

	if (!result?.session) {
		throw redirect('/edge-cms/sign-in');
	}

	return {
		...result,
		auth,
	};
}

export async function requireAnonymous(request: Request, env: Env) {
	const auth = createAuth(env);

	const result = await auth.api.getSession({
		headers: request.headers,
	});

	if (result?.session) {
		throw redirect('/edge-cms');
	}
}
