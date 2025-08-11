import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from './schema.server';

export function createAuth(env: Env, request: Request) {
	const db = drizzle(env.DB);
	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: authSchema,
		}),
		baseURL,
		trustedOrigins: [baseURL],
		secret: env.AUTH_SECRET,
		emailAndPassword: {
			enabled: true,
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7, // 7 days
			updateAge: 60 * 60 * 24, // 1 day
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // 5 minutes
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
