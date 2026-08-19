import { createRequestHandler } from 'react-router';
import { ReleaseVersionWorkflow } from './release-version-workflow';
import { RollbackVersionWorkflow } from './rollback-version-workflow';
import { AITranslateWorkflow } from './ai-translate-workflow';
import { EdgeCMSService } from './edgecms-service';
import { LegalReleaseWorkflow } from './legal-release-workflow';
import { handleConsentRequest } from '~/utils/legal-consent.server';

if (import.meta.hot) {
	import.meta.hot.accept();
}

const requestHandler = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, context) {
		const pathname = new URL(request.url).pathname;
		if (
			pathname === '/edge-cms/consent' ||
			pathname.startsWith('/edge-cms/consent/')
		) {
			return handleConsentRequest(request, env, context);
		}

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
		const response = await requestHandler(request);

		// Add CORS headers to the response
		const newResponse = new Response(response.body, response);
		Object.entries(CORS_HEADERS).forEach(([key, value]) => {
			newResponse.headers.set(key, value);
		});

		return newResponse;
	},
} satisfies ExportedHandler<Env>;

export {
	ReleaseVersionWorkflow,
	RollbackVersionWorkflow,
	AITranslateWorkflow,
	LegalReleaseWorkflow,
	EdgeCMSService,
};
