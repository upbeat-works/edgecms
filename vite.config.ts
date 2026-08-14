import { reactRouter } from '@react-router/dev/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

function wranglerAssetsDir() {
	return {
		name: 'ssr-wrangler-assets-dir',
		apply: 'build' as const,
		applyToEnvironment(environment: any) {
			return environment.name === 'ssr';
		},
		async generateBundle(_opts: any, bundle: any) {
			let asset = bundle['wrangler.json'];
			let wrangler = JSON.parse(asset.source) as { assets?: {} };
			if (wrangler.assets) {
				wrangler.assets = { ...wrangler.assets, directory: '../client' };
				asset.source = JSON.stringify(wrangler);
			}
		},
	};
}

export default defineConfig(({ mode }) => {
	const localAllowedHosts = loadEnv(mode, process.cwd(), '')
		.LOCAL_VITE_ALLOWED_HOSTS?.split(',')
		.map(host => host.trim())
		.filter(Boolean);

	return {
		server: {
			allowedHosts: localAllowedHosts ?? [],
		},
		optimizeDeps: {
			entries: ['app/**/*.{ts,tsx}'],
			ignoreOutdatedRequests: true,
		},
		build: {
			outDir: 'dist/edge-cms',
			assetsDir: 'edge-cms/assets',
		},
		plugins: [
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			wranglerAssetsDir(),
			tailwindcss(),
			reactRouter(),
		],
		resolve: { tsconfigPaths: true },
	};
});
