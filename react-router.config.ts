import type { Config } from '@react-router/dev/config';

export default {
	ssr: true,
	routeDiscovery: {
		mode: 'lazy',
		manifestPath: '/edge-cms/__manifest',
	},
} satisfies Config;
