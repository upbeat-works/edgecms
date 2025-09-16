import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from './schema.server';
// @ts-ignore
import { randomBytes, scryptSync } from 'node:crypto';
// @ts-ignore
import { Buffer } from 'node:buffer';

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
			password: {
				hash: async password => {
					// use scrypt from node:crypto
					const salt = randomBytes(16).toString('hex');
					const hash = scryptSync(password, salt, 64).toString('hex');
					return `${salt}:${hash}`;
				},
				verify: async ({ hash, password }) => {
					const [salt, key] = hash.split(':');
					const keyBuffer = Buffer.from(key, 'hex');
					const hashBuffer = scryptSync(password, salt, 64);
					return keyBuffer.equals(hashBuffer);
				},
			},
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
