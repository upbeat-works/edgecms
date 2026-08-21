import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { EdgeCMSClient } from '../src/api.js';
import {
	attachBlockMedia,
	listMedia,
	renameMediaFile,
	replaceMediaFile,
	uploadMediaFile,
} from '../src/commands/media.js';
import { projectDir } from './helpers.js';

const item = {
	id: 7,
	filename: 'hero.png',
	mimeType: 'image/png',
	sizeBytes: 4,
	section: null,
	state: 'live' as const,
	uploadedAt: '2026-01-01T00:00:00.000Z',
	version: 2,
	canonicalUrl: 'https://cms.test/edge-cms/public/media/hero.png',
	revisionUrl: 'https://cms.test/edge-cms/public/media/revisions/7/hero.png',
};

const requests: { method: string; path: string; body?: unknown }[] = [];
const server = setupServer(
	http.get('*/api/media', ({ request }) => {
		requests.push({
			method: 'GET',
			path: new URL(request.url).pathname + new URL(request.url).search,
		});
		return HttpResponse.json({ media: [item] });
	}),
	http.post('*/api/media', async ({ request }) => {
		const form = await request.formData();
		requests.push({
			method: 'POST',
			path: new URL(request.url).pathname,
			body: form,
		});
		return HttpResponse.json(item, { status: 201 });
	}),
	http.put('*/api/media/:id', async ({ request }) => {
		requests.push({
			method: 'PUT',
			path: new URL(request.url).pathname,
			body: await request.formData(),
		});
		return HttpResponse.json(item);
	}),
	http.patch('*/api/media/:id', async ({ request }) => {
		requests.push({
			method: 'PATCH',
			path: new URL(request.url).pathname,
			body: await request.json(),
		});
		return HttpResponse.json({ ...item, filename: 'homepage-hero.png' });
	}),
	http.patch(
		'*/api/blocks/collections/:collection/instances/:instance/properties/:property',
		async ({ request }) => {
			requests.push({
				method: 'PATCH',
				path: new URL(request.url).pathname,
				body: await request.json(),
			});
			return HttpResponse.json({
				collection: 'heroes',
				instanceId: 3,
				property: 'image',
				mediaId: 7,
				state: 'draft',
				draftVersionId: 4,
			});
		},
	),
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

describe('media SDK', () => {
	it('sends list filters and multipart mutations through the public client', async () => {
		const client = new EdgeCMSClient({
			baseUrl: 'https://cms.test/edge-cms',
			apiKey: 'key',
		});
		await client.getMedia({ search: 'hero', state: 'live', allVersions: true });
		await client.uploadMedia(new Blob(['file']), 'hero.png', 'home');
		await client.replaceMedia(6, new Blob(['new']), 'other.png');
		await client.renameMedia(6, 'homepage-hero.png');
		await client.setBlockMedia({
			collection: 'heroes',
			instanceId: 3,
			property: 'image',
			mediaId: 7,
		});

		expect(requests.map(request => [request.method, request.path])).toEqual([
			['GET', '/edge-cms/api/media?search=hero&state=live&allVersions=true'],
			['POST', '/edge-cms/api/media'],
			['PUT', '/edge-cms/api/media/6'],
			['PATCH', '/edge-cms/api/media/6'],
			[
				'PATCH',
				'/edge-cms/api/blocks/collections/heroes/instances/3/properties/image',
			],
		]);
		expect((requests[1].body as FormData).get('section')).toBe('home');
		expect(requests[3].body).toEqual({ filename: 'homepage-hero.png' });
		expect(requests[4].body).toEqual({ mediaId: 7 });
	});

	it('exposes media and block attachment as CLI operations', async () => {
		const { config, path } = await projectDir({ 'image.png': 'body' });
		await listMedia(config, { search: 'hero' });
		await uploadMediaFile(config, path('image.png'));
		await replaceMediaFile(config, 6, path('image.png'));
		await renameMediaFile(config, 6, 'homepage-hero.png');
		await attachBlockMedia(config, {
			collection: 'heroes',
			instanceId: 3,
			property: 'image',
			mediaId: 7,
		});

		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining(item.canonicalUrl),
		);
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining('(draft v4)'),
		);
		expect(((requests[1].body as FormData).get('file') as File).type).toBe(
			'image/png',
		);
	});
});
