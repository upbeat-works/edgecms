import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/media';
import { action as replace } from '~/routes/edge-cms/api/media.$id';
import { loader as serveMedia } from '~/routes/edge-cms/public/media.$filename';
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

	it('renames every revision and serves them from the new public URL', async () => {
		const original = await seedMedia('hero.png', 'old');
		const replacement = new FormData();
		replacement.set(
			'file',
			new File(['new'], 'ignored.png', { type: 'image/png' }),
		);
		await replace({
			request: request(`media/${original.id}`, {
				method: 'PUT',
				body: replacement,
			}),
			params: { id: String(original.id) },
		} as never);

		const response = await replace({
			request: request(`media/${original.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: 'Campaign Hero.PNG' }),
			}),
			params: { id: String(original.id) },
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			id: original.id,
			filename: 'campaign-hero.PNG',
			version: 1,
			canonicalUrl: 'https://cms.test/edge-cms/public/media/campaign-hero.PNG',
		});
		const renamed = (await getMedia({ filename: 'campaign-hero.PNG' })).sort(
			(a, b) => a.version - b.version,
		);
		expect(
			renamed.map(item => ({
				id: item.id,
				version: item.version,
				state: item.state,
			})),
		).toEqual([
			{ id: original.id, version: 1, state: 'archived' },
			{ id: expect.any(Number), version: 2, state: 'live' },
		]);
		await expect(getMedia({ filename: 'hero.png' })).resolves.toEqual([]);
		await expect(env.MEDIA_BUCKET.get('hero.png')).resolves.toBeNull();
		await expect(env.MEDIA_BUCKET.get('hero.png-v2')).resolves.toBeNull();

		const current = await serveMedia({
			request: new Request(
				'https://cms.test/edge-cms/public/media/campaign-hero.PNG',
			),
			params: { filename: 'campaign-hero.PNG' },
		} as never);
		expect(current.headers.get('content-type')).toBe('image/png');
		expect(new TextDecoder().decode(await current.arrayBuffer())).toBe('new');
		const firstVersion = await serveMedia({
			request: new Request(
				'https://cms.test/edge-cms/public/media/campaign-hero.PNG?version=1',
			),
			params: { filename: 'campaign-hero.PNG' },
		} as never);
		expect(new TextDecoder().decode(await firstVersion.arrayBuffer())).toBe(
			'old',
		);
		await expect(
			serveMedia({
				request: new Request('https://cms.test/edge-cms/public/media/hero.png'),
				params: { filename: 'hero.png' },
			} as never),
		).rejects.toMatchObject({ status: 404 });
	});

	it('does not overwrite another media file when renaming', async () => {
		const hero = await seedMedia('hero.png', 'hero');
		await seedMedia('logo.png', 'logo');

		const response = await replace({
			request: request(`media/${hero.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: 'logo.png' }),
			}),
			params: { id: String(hero.id) },
		} as never);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'MEDIA_FILENAME_EXISTS',
		});
		await expect(
			env.MEDIA_BUCKET.get('hero.png').then(file => file?.text()),
		).resolves.toBe('hero');
		await expect(
			env.MEDIA_BUCKET.get('logo.png').then(file => file?.text()),
		).resolves.toBe('logo');
	});

	it('leaves the existing name and objects in place when a revision is missing', async () => {
		const original = await seedMedia('hero.png', 'old');
		const replacement = new FormData();
		replacement.set(
			'file',
			new File(['new'], 'ignored.png', { type: 'image/png' }),
		);
		await replace({
			request: request(`media/${original.id}`, {
				method: 'PUT',
				body: replacement,
			}),
			params: { id: String(original.id) },
		} as never);
		await env.MEDIA_BUCKET.delete('hero.png-v2');

		const response = await replace({
			request: request(`media/${original.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: 'renamed.png' }),
			}),
			params: { id: String(original.id) },
		} as never);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'MEDIA_REVISION_MISSING',
		});
		expect(await getMedia({ filename: 'hero.png' })).toHaveLength(2);
		await expect(getMedia({ filename: 'renamed.png' })).resolves.toEqual([]);
		await expect(
			env.MEDIA_BUCKET.get('hero.png').then(file => file?.text()),
		).resolves.toBe('old');
		await expect(env.MEDIA_BUCKET.get('renamed.png')).resolves.toBeNull();
	});
});
