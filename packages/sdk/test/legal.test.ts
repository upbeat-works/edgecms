import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createLegalDraft, updateLegalDraft } from '../src/commands/legal.js';
import { projectDir } from './helpers.js';

const requests: Array<{ method: string; path: string; body: unknown }> = [];
const server = setupServer(
	http.post('*/api/legal', async ({ request }) => {
		const body = await request.json();
		requests.push({
			method: request.method,
			path: new URL(request.url).pathname,
			body,
		});
		return HttpResponse.json(
			{
				id: 41,
				name: 'Privacy Policy',
				slug: 'privacy-policy',
				type: 'privacy_policy',
				locale: 'en',
				state: 'draft',
			},
			{ status: 201 },
		);
	}),
	http.put('*/api/legal/:id/drafts/:locale', async ({ request }) => {
		const body = await request.json();
		requests.push({
			method: request.method,
			path: new URL(request.url).pathname,
			body,
		});
		return HttpResponse.json({
			documentId: 41,
			locale: 'es',
			state: 'draft',
		});
	}),
);

beforeEach(() => {
	requests.length = 0;
	server.listen({ onUnhandledRequest: 'error' });
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	server.close();
	vi.restoreAllMocks();
});

describe('legal draft CLI commands', () => {
	it('creates and updates localized drafts from exact Markdown files', async () => {
		const english = '# Privacy\r\n\r\nYour choices stay yours.\n';
		const spanish = '# Privacidad\n\nTus decisiones son tuyas.\n';
		const { config, path } = await projectDir({
			'privacy.en.md': english,
			'privacy.es.md': spanish,
		});

		await createLegalDraft(config, path('privacy.en.md'), {
			name: 'Privacy Policy',
			type: 'privacy_policy',
		});
		await updateLegalDraft(config, 41, path('privacy.es.md'), {
			locale: 'es',
		});

		expect(requests).toEqual([
			{
				method: 'POST',
				path: '/edge-cms/api/legal',
				body: {
					name: 'Privacy Policy',
					type: 'privacy_policy',
					locale: 'en',
					markdown: english,
				},
			},
			{
				method: 'PUT',
				path: '/edge-cms/api/legal/41/drafts/es',
				body: { markdown: spanish },
			},
		]);
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining('Privacy Policy'),
		);
		expect(console.log).toHaveBeenCalledWith(expect.stringContaining('draft'));
	});

	it('fails before making a request when a Markdown file is missing', async () => {
		const { config, path } = await projectDir();

		await expect(
			updateLegalDraft(config, 41, path('missing.md')),
		).rejects.toThrow(`File not found: ${path('missing.md')}`);
		expect(requests).toEqual([]);
	});
});
