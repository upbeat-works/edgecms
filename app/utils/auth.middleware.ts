import { type Session, type User } from 'better-auth';
import { redirect } from 'react-router';
import { createAuth, type Auth } from './auth.server';

export interface ApiKeyResult {
	valid: true;
	key: {
		id: string;
		name: string | null;
		userId: string;
		prefix: string | null;
		permissions: Record<string, string[]> | null;
		metadata: Record<string, unknown> | null;
	};
}

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

/**
 * Validates API key from x-api-key header.
 * Returns the validated key info if valid, throws 401 Response if not.
 */
export async function requireApiKey(
	request: Request,
	env: Env,
): Promise<ApiKeyResult> {
	const auth = createAuth(env);
	const apiKey = request.headers.get('x-api-key');

	if (!apiKey) {
		throw new Response(
			JSON.stringify({ error: 'API key required', code: 'MISSING_API_KEY' }),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}

	const result = await auth.api.verifyApiKey({
		body: { key: apiKey },
	});

	if (!result.valid || !result.key) {
		throw new Response(
			JSON.stringify({
				error: result.error?.message || 'Invalid API key',
				code: result.error?.code || 'INVALID_API_KEY',
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}

	return {
		valid: true,
		key: {
			id: result.key.id,
			name: result.key.name,
			userId: result.key.userId,
			prefix: result.key.prefix,
			permissions: result.key.permissions ?? null,
			metadata: (result.key.metadata as Record<string, unknown>) ?? null,
		},
	};
}
