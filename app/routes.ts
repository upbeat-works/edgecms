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
			route('sections', 'routes/edge-cms/sections.tsx'),
		]),
		route('sign-in', 'routes/edge-cms/auth/sign-in.tsx'),
		route('sign-out', 'routes/edge-cms/auth/sign-out.tsx'),
		route('_a/sign-up', 'routes/edge-cms/auth/sign-up.tsx'),
		route(
			'public/i18n/:locale.json',
			'routes/edge-cms/public/i18n.$locale[.]json.tsx',
		),
		route(
			'public/media/:filename',
			'routes/edge-cms/public/media.$filename.tsx',
		),
	]),
] satisfies RouteConfig;
