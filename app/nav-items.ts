import extension from './extension';
import type { NavItem } from './extension.types';

export const builtInNavItems: NavItem[] = [
	{ href: '/edge-cms/i18n', label: 'Translations' },
	{ href: '/edge-cms/media', label: 'Media' },
	{ href: '/edge-cms/blocks', label: 'Blocks' },
	{ href: '/edge-cms/sections', label: 'Sections' },
];

export const navItems: NavItem[] = [
	...builtInNavItems,
	...(extension.navItems ?? []),
];
