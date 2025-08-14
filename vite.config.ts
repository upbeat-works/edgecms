import { reactRouter } from '@react-router/dev/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ command}) => {
	const isDev = command === 'serve';
	return {
		base: isDev ? '/' : '/edge-cms/',
		plugins: [
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			tailwindcss(),
			reactRouter(),
			tsconfigPaths(),
		],
	};
});
