import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/media';
import { action as replace } from '~/routes/edge-cms/api/media.$id';
import { loader as serveMedia } from '~/routes/edge-cms/public/media.$filename';
import { loader as serveMediaRevision } from '~/routes/edge-cms/public/media-revision';
import {
	getMedia,
	getMediaRevisionById,
	replaceMediaRevision,
} from '~/utils/db/media.server';
import {
	createVersion,
	getLatestVersion,
	promoteVersion,
} from '~/utils/db/versions.server';
import { buildVersionedFilename, deleteVersion } from '~/utils/media.server';
import { createApiKey, resetDb, seedMedia } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

afterEach(() => vi.restoreAllMocks());

function request(path: string, init: RequestInit = {}) {
	return new Request(`https://cms.test/edge-cms/api/${path}`, {
		...init,
		headers: {
			'x-api-key': apiKey,
			...(init.headers as Record<string, string>),
		},
	});
}

async function currentMediaText(filename: string) {
	const alias = await serveMedia({
		request: new Request(`https://cms.test/edge-cms/public/media/${filename}`),
		params: { filename },
	} as never);
	const location = alias.headers.get('location');
	if (!location)
		throw new Error('Media filename did not resolve to a revision');
	const revisionId = Number(new URL(location).pathname.split('/').at(-2));
	const revision = await serveMediaRevision({
		request: new Request(location),
		params: { id: String(revisionId), filename: 'hero.png' },
	} as never);
	return new TextDecoder().decode(await revision.arrayBuffer());
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
		await expect(getLatestVersion('draft')).resolves.toBeNull();
	});

	it('does not open a draft for a rejected upload', async () => {
		const response = await action({
			request: request('media', { method: 'POST', body: new FormData() }),
		} as never);

		expect(response.status).toBe(400);
		await expect(getLatestVersion('draft')).resolves.toBeNull();
	});

	it('does not open a draft for a rejected rename', async () => {
		const media = await seedMedia('hero.png');
		const response = await replace({
			request: request(`media/${media.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: 42 }),
			}),
			params: { id: String(media.id) },
		} as never);

		expect(response.status).toBe(400);
		await expect(getLatestVersion('draft')).resolves.toBeNull();
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
			revisionId: number;
			version: number;
			canonicalUrl: string;
		};

		expect(body).toMatchObject({
			version: 2,
			canonicalUrl: 'https://cms.test/edge-cms/public/media/hero.png',
		});
		expect(body.id).toBe(original.id);
		expect(body.revisionId).not.toBe(original.revisionId);
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
		await expect(
			env.DB.prepare("UPDATE media_revisions SET state = 'live' WHERE id = ?")
				.bind(original.revisionId)
				.run(),
		).rejects.toThrow();
	});

	it('keeps the current revision live when the replacement write fails', async () => {
		const original = await seedMedia('hero.png', 'old');

		await expect(
			replaceMediaRevision({
				assetId: original.id,
				mimeType: 'image/png',
				sizeBytes: 3,
				version: 1,
			}),
		).rejects.toThrow();
		await expect(getMedia({ filename: 'hero.png' })).resolves.toMatchObject([
			{ revisionId: original.revisionId, state: 'live', version: 1 },
		]);
	});

	it('serves the latest media revision after a block release', async () => {
		const original = await seedMedia('hero.png', 'old');
		const firstRelease = await createVersion('first');
		await promoteVersion(firstRelease.id);

		const form = new FormData();
		form.set('file', new File(['new'], 'hero.png', { type: 'image/png' }));
		await replace({
			request: request(`media/${original.id}`, { method: 'PUT', body: form }),
			params: { id: String(original.id) },
		} as never);

		expect(await currentMediaText('hero.png')).toBe('new');
		await expect(getLatestVersion('draft')).resolves.toBeNull();
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
			version: 2,
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
			{ id: original.id, version: 2, state: 'live' },
		]);
		await expect(getMedia({ filename: 'hero.png' })).resolves.toEqual([]);
		await expect(env.MEDIA_BUCKET.get('hero.png')).resolves.toBeNull();
		await expect(env.MEDIA_BUCKET.get('hero.png-v2')).resolves.toBeNull();

		const currentAlias = await serveMedia({
			request: new Request(
				'https://cms.test/edge-cms/public/media/campaign-hero.PNG',
			),
			params: { filename: 'campaign-hero.PNG' },
		} as never);
		expect(currentAlias.status).toBe(302);
		expect(currentAlias.headers.get('location')).toBe(
			`https://cms.test/edge-cms/public/media/revisions/${renamed[1].revisionId}/campaign-hero.PNG`,
		);
		const current = await serveMediaRevision({
			request: new Request(currentAlias.headers.get('location')!),
			params: {
				id: String(renamed[1].revisionId),
				filename: 'campaign-hero.PNG',
			},
		} as never);
		expect(current.headers.get('content-type')).toBe('image/png');
		expect(new TextDecoder().decode(await current.arrayBuffer())).toBe('new');
		const firstVersionAlias = await serveMedia({
			request: new Request(
				'https://cms.test/edge-cms/public/media/campaign-hero.PNG?version=1',
			),
			params: { filename: 'campaign-hero.PNG' },
		} as never);
		expect(firstVersionAlias.headers.get('location')).toBe(
			`https://cms.test/edge-cms/public/media/revisions/${renamed[0].revisionId}/campaign-hero.PNG`,
		);
		const firstVersion = await serveMediaRevision({
			request: new Request(firstVersionAlias.headers.get('location')!),
			params: {
				id: String(renamed[0].revisionId),
				filename: 'campaign-hero.PNG',
			},
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

	it('keeps database metadata when storage deletion fails', async () => {
		const media = await seedMedia('hero.png', 'old');
		vi.spyOn(env.MEDIA_BUCKET, 'delete').mockRejectedValueOnce(
			new Error('R2 unavailable'),
		);

		await expect(deleteVersion(media.revisionId)).rejects.toThrow(
			'R2 unavailable',
		);
		await expect(getMediaRevisionById(media.revisionId)).resolves.toMatchObject(
			{
				filename: 'hero.png',
				state: 'live',
			},
		);
	});

	it('promotes the previous revision when the current revision is deleted', async () => {
		const original = await seedMedia('hero.png', 'old');
		const form = new FormData();
		form.set('file', new File(['new'], 'hero.png', { type: 'image/png' }));
		const response = await replace({
			request: request(`media/${original.id}`, { method: 'PUT', body: form }),
			params: { id: String(original.id) },
		} as never);
		const replacement = (await response.json()) as { revisionId: number };

		await deleteVersion(replacement.revisionId);

		expect(await currentMediaText('hero.png')).toBe('old');
		await expect(getMedia({ filename: 'hero.png' })).resolves.toMatchObject([
			{ revisionId: original.revisionId, state: 'live', version: 1 },
		]);
	});
});
