import {
	type RouteConfig,
	route,
	prefix,
	index,
	layout,
} from '@react-router/dev/routes';

export default [
	...prefix('edge-cms', [
		index('routes/edge-cms/home.tsx'),
		layout('routes/edge-cms/_layout.tsx', [
			route('i18n', 'routes/edge-cms/i18n/i18n.tsx'),
			route('i18n/versions', 'routes/edge-cms/versions.tsx'),
			route('media', 'routes/edge-cms/media/media.tsx'),
			route('media/upload', 'routes/edge-cms/media/media-upload.ts'),
			route('blocks', 'routes/edge-cms/blocks/blocks.tsx', [
				route('new', 'routes/edge-cms/blocks/blocks.new.tsx'),
				route('schemas', 'routes/edge-cms/blocks/blocks.schemas.tsx', [
					route('new', 'routes/edge-cms/blocks/blocks.schemas.new.tsx'),
					route(':id', 'routes/edge-cms/blocks/blocks.schemas.$id.tsx', [
						route(
							'properties/new',
							'routes/edge-cms/blocks/blocks.schemas.$id.properties.new.tsx',
						),
					]),
				]),
				route(':id', 'routes/edge-cms/blocks/blocks.$id.tsx', [
					route(
						'instances/:action',
						'routes/edge-cms/blocks/blocks.$id.instances.$action.tsx',
					),
				]),
			]),
			route('sections', 'routes/edge-cms/sections.tsx'),
			route('users', 'routes/edge-cms/users/users.tsx'),
			route('users/:id', 'routes/edge-cms/users/users.$id.tsx'),
			route('settings/api-keys', 'routes/edge-cms/settings/api-keys.tsx'),
		]),
		route('sign-in', 'routes/edge-cms/auth/sign-in.tsx'),
		route('sign-out', 'routes/edge-cms/auth/sign-out.tsx'),
		route('_a/sign-up', 'routes/edge-cms/auth/sign-up.tsx'),
		// API routes (API key authenticated)
		route('api/i18n/pull', 'routes/edge-cms/api/i18n.pull.ts'),
		route('api/i18n/push', 'routes/edge-cms/api/i18n.push.ts'),
		route('api/i18n/languages', 'routes/edge-cms/api/i18n.languages.ts'),
		route('api/blocks/import', 'routes/edge-cms/api/blocks.import.ts'),
		// Public routes
		route(
			'public/i18n/:locale.json',
			'routes/edge-cms/public/i18n.$locale[.]json.tsx',
		),
		route(
			'public/media/:filename',
			'routes/edge-cms/public/media.$filename.tsx',
		),
		route(
			'public/blocks/:collection',
			'routes/edge-cms/public/blocks.$collection.tsx',
		),
	]),
] satisfies RouteConfig;
