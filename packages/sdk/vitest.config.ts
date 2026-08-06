import { defineConfig } from 'vitest/config';

// The CLI is plain Node code, so it runs in a Node environment rather than the
// Workers pool the CMS itself is tested in.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
	},
});
