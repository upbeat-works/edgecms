import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { pull } from '../src/commands/pull.js';
import { push } from '../src/commands/push.js';
import { projectDir } from './helpers.js';

const requests: Record<string, unknown>[] = [];
let revision = 'revision-1';
let supportsRevisions = true;

const server = setupServer(
	http.get('*/api/i18n/pull', () =>
		HttpResponse.json({
			languages: [{ locale: 'en', default: true }],
			defaultLocale: 'en',
			translations: { en: { 'home.title': 'Welcome' } },
			...(supportsRevisions ? { revision } : {}),
		}),
	),
	http.post('*/api/i18n/push', async ({ request }) => {
		const body = (await request.json()) as Record<string, unknown>;
		requests.push(body);

		if (body.baseRevision !== revision) {
			return HttpResponse.json(
				{
					error: 'The CMS catalogue changed after the last pull.',
					code: 'CATALOGUE_CONFLICT',
				},
				{ status: 409 },
			);
		}

		revision = 'revision-2';
		return HttpResponse.json({
			success: true,
			keysUpdated: 1,
			locale: 'en',
			section: null,
			revision,
		});
	}),
);

beforeEach(() => {
	requests.length = 0;
	revision = 'revision-1';
	supportsRevisions = true;
	server.listen({ onUnhandledRequest: 'error' });
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
	server.close();
	vi.restoreAllMocks();
});

describe('pushing a locally edited catalogue', () => {
	it('requires revision support from the EdgeCMS instance', async () => {
		const { config } = await projectDir();
		supportsRevisions = false;

		await expect(pull(config)).rejects.toThrow(
			'Upgrade the instance before using conflict-safe pushes',
		);
	});

	it('stops before contacting the CMS when no pull state exists', async () => {
		const { config } = await projectDir({
			'locales/en.json': { 'home.title': 'Welcome back' },
		});

		await expect(push(config)).rejects.toThrow('No EdgeCMS pull state found');
		expect(requests).toHaveLength(0);
	});

	it('uses the revision from the last pull and advances it after a push', async () => {
		const { config, path } = await projectDir();
		await pull(config);
		await writeFile(
			path('locales/en.json'),
			JSON.stringify({ 'home.title': 'Welcome back' }),
		);

		await push(config);
		await push(config);

		expect(requests).toMatchObject([
			{ baseRevision: 'revision-1' },
			{ baseRevision: 'revision-2' },
		]);
	});
});
