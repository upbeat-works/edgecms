import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from './schema.server';

let auth: ReturnType<typeof _createAuth> | null = null;

function _createAuth(env: Env, defaultRole?: string) {
	const db = drizzle(env.DB);

	const authInstance = betterAuth({
		plugins: [
			admin({
				defaultRole,
			}),
		],
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: authSchema,
		}),
		baseURL: env.BASE_URL || 'undefined',
		trustedOrigins:
			typeof env.TRUSTED_ORIGINS !== 'undefined'
				? env.TRUSTED_ORIGINS.split(',')
				: undefined,
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

	return authInstance;
}

export const createAuth = (env: Env, defaultRole?: string) => {
	if (auth && !defaultRole) {
		return auth;
	}

	if (defaultRole) {
		return _createAuth(env, defaultRole);
	}

	return _createAuth(env, defaultRole);
};

export type Auth = ReturnType<typeof createAuth>;
