import type { RouteConfigEntry } from '@react-router/dev/routes';

export type NavItem = {
	href: string;
	label: string;
};

export type Extension = {
	routes?: RouteConfigEntry[];
	navItems?: NavItem[];
};
