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
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;

export { ReleaseVersionWorkflow, RollbackVersionWorkflow, AITranslateWorkflow };
