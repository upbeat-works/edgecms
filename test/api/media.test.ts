import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/media';
import { action as replace } from '~/routes/edge-cms/api/media.$id';
import { getMedia } from '~/utils/db/media.server';
import { buildVersionedFilename } from '~/utils/media.server';
import { createApiKey, resetDb, seedMedia } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

function request(path: string, init: RequestInit = {}) {
	return new Request(`https://cms.test/edge-cms/api/${path}`, {
		...init,
		headers: {
			'x-api-key': apiKey,
			...(init.headers as Record<string, string>),
		},
	});
}

describe('media API', () => {
	it('lists latest revisions and searches filenames', async () => {
		const first = await seedMedia('hero.png');
		await seedMedia('logo.svg', '<svg/>', 'image/svg+xml');
		const replacement = new FormData();
		replacement.set(
			'file',
			new File(['new'], 'ignored.png', { type: 'image/png' }),
		);
		await replace({
			request: request(`media/${first.id}`, {
				method: 'PUT',
				body: replacement,
			}),
			params: { id: String(first.id) },
		} as never);

		const response = await loader({
			request: request('media?search=HERO'),
		} as never);
		const body = (await response.json()) as {
			media: Record<string, unknown>[];
		};
		expect(body.media).toHaveLength(1);
		expect(body.media[0]).toMatchObject({
			filename: 'hero.png',
			version: 2,
			state: 'live',
			canonicalUrl: 'https://cms.test/edge-cms/public/media/hero.png',
		});
	});

	it('uploads a file and returns its usable identity', async () => {
		const form = new FormData();
		form.set(
			'file',
			new File(['picture'], 'My Picture.PNG', { type: 'image/png' }),
		);
		const response = await action({
			request: request('media', { method: 'POST', body: form }),
		} as never);

		expect(response.status).toBe(201);
		const body = (await response.json()) as {
			id: number;
			filename: string;
			canonicalUrl: string;
		};
		expect(body).toMatchObject({
			filename: 'my-picture.PNG',
			canonicalUrl: 'https://cms.test/edge-cms/public/media/my-picture.PNG',
		});
		const object = await env.MEDIA_BUCKET.get('my-picture.PNG');
		await expect(object?.text()).resolves.toBe('picture');
	});

	it('replaces a revision without changing its canonical URL', async () => {
		const original = await seedMedia('hero.png', 'old');
		const form = new FormData();
		form.set('file', new File(['new'], 'other.png', { type: 'image/png' }));
		const response = await replace({
			request: request(`media/${original.id}`, { method: 'PUT', body: form }),
			params: { id: String(original.id) },
		} as never);
		const body = (await response.json()) as {
			id: number;
			version: number;
			canonicalUrl: string;
		};

		expect(body).toMatchObject({
			version: 2,
			canonicalUrl: 'https://cms.test/edge-cms/public/media/hero.png',
		});
		expect(body.id).not.toBe(original.id);
		expect(
			(await getMedia({ filename: 'hero.png' }))
				.sort((a, b) => a.version - b.version)
				.map(item => item.state),
		).toEqual(['archived', 'live']);
		await expect(
			env.MEDIA_BUCKET.get(buildVersionedFilename('hero.png', 2)).then(file =>
				file?.text(),
			),
		).resolves.toBe('new');
	});
});
