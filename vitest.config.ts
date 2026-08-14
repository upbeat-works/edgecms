import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import {
	cloudflareTest,
	readD1Migrations,
} from '@cloudflare/vitest-pool-workers';

// Migrations are read at config time (in Node) and handed to the test worker as
// a binding, because the worker itself has no filesystem access.
const migrations = await readD1Migrations('./migrations');
const legalSigningKeys = await crypto.subtle.generateKey(
	{ name: 'ECDSA', namedCurve: 'P-256' },
	true,
	['sign', 'verify'],
);
const legalSigningPrivateJwk = await crypto.subtle.exportKey(
	'jwk',
	legalSigningKeys.privateKey,
);

export default defineConfig({
	resolve: {
		alias: { '~': resolve(import.meta.dirname, './app') },
	},
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: { TEST_MIGRATIONS: migrations },
				// Real secrets in production; absent in tests unless set here.
				AUTH_SECRET: 'test-auth-secret-not-a-real-secret',
				SESSION_SECRET: 'test-session-secret-not-a-real-secret',
				LEGAL_SIGNING_PRIVATE_JWK: JSON.stringify(legalSigningPrivateJwk),
			},
		}),
	],
	test: {
		include: ['test/**/*.test.ts'],
		setupFiles: ['./test/setup.ts'],
		coverage: {
			// v8 coverage needs `node:inspector`, which workerd does not implement,
			// so the Workers pool requires the istanbul provider.
			provider: 'istanbul',
			include: [
				'app/utils/services/**/*.ts',
				'app/routes/edge-cms/api/**/*.ts',
				'app/utils/db/**/*.ts',
				'workers/edgecms-service.ts',
			],
		},
	},
});
