import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MobileNavigation } from '../../app/routes/edge-cms/mobile-navigation';

describe('mobile navigation', () => {
	it('provides a collapsed control for opening the navigation menu', () => {
		const markup = renderToStaticMarkup(
			createElement(
				MemoryRouter,
				{ initialEntries: ['/edge-cms/legal/1'] },
				createElement(MobileNavigation, {
					pathname: '/edge-cms/legal/1',
					isAdmin: true,
				}),
			),
		);

		expect(markup).toContain('<button');
		expect(markup).toContain('aria-label="Navigation menu"');
		expect(markup).toContain('aria-expanded="false"');
	});
});
