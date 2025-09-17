import { createRequestHandler } from 'react-router';
import { ReleaseVersionWorkflow } from './release-version-workflow';
import { RollbackVersionWorkflow } from './rollback-version-workflow';
import { AITranslateWorkflow } from './ai-translate-workflow';

if (import.meta.hot) {
	import.meta.hot.accept();
}

declare module 'react-router' {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, ctx) {
		const CORS_HEADERS = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET',
			'Access-Control-Max-Age': '86400', // 24 hours
		};

		const trustedOrigins = env.TRUSTED_ORIGINS.split(',');
		const origin = request.headers.get('Origin');
		if (origin && trustedOrigins.includes(origin)) {
			CORS_HEADERS['Access-Control-Allow-Origin'] = origin;
		}

		// Handle OPTIONS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 200,
				headers: CORS_HEADERS,
			});
		}

		// Handle the main request
		const response = await requestHandler(request, {
			cloudflare: { env, ctx },
		});

		// Add CORS headers to the response
		const newResponse = new Response(response.body, response);
		Object.entries(CORS_HEADERS).forEach(([key, value]) => {
			newResponse.headers.set(key, value);
		});

		return newResponse;
	},
} satisfies ExportedHandler<Env>;

export { ReleaseVersionWorkflow, RollbackVersionWorkflow, AITranslateWorkflow };
