import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from './schema.server';

let auth: ReturnType<typeof betterAuth> | null = null;

export function createAuth(env: Env) {	
	if (auth) {
		return auth;
	}

	const db = drizzle(env.DB);

	const authInstance = betterAuth({
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: authSchema,
		}),
		baseURL: env.BASE_URL || 'undefined',
		trustedOrigins: typeof env.TRUSTED_ORIGINS !== 'undefined' ? env.TRUSTED_ORIGINS.split(',') : undefined,
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
	
	// Cache the instance for future requests
	auth = authInstance;
	
	return auth;
}

export type Auth = ReturnType<typeof createAuth>;
