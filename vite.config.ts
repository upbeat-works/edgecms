import { reactRouter } from '@react-router/dev/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

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

export default defineConfig({
	build: {
		outDir: 'dist/edge-cms',
		assetsDir: 'edge-cms/assets',
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		wranglerAssetsDir(),
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
	],
});
