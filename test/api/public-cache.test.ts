import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { markMediaLive } from '~/utils/db/media.server';
import { action as replaceMedia } from '~/routes/edge-cms/api/media.$id';
import { loader as mediaAlias } from '~/routes/edge-cms/public/media.$filename';
import { loader as mediaRevision } from '~/routes/edge-cms/public/media-revision';
import { createApiKey, resetDb, seedMedia } from '../helpers';

beforeEach(resetDb);

function serveMediaAlias(filename: string) {
	return mediaAlias({
		request: new Request(`https://cms.test/edge-cms/public/media/${filename}`),
		params: { filename },
	} as never);
}

function serveMediaRevision(id: number, filename: string, request?: Request) {
	return mediaRevision({
		request:
			request ??
			new Request(
				`https://cms.test/edge-cms/public/media/revisions/${id}/${filename}`,
			),
		params: { id: String(id), filename },
	} as never);
}

function replacementRequest(apiKey: string, mediaId: number, body: string) {
	const form = new FormData();
	form.set('file', new File([body], 'ignored.png', { type: 'image/png' }));
	return replaceMedia({
		request: new Request(`https://cms.test/edge-cms/api/media/${mediaId}`, {
			method: 'PUT',
			headers: { 'x-api-key': apiKey },
			body: form,
		}),
		params: { id: String(mediaId) },
	} as never);
}

async function responseText(response: Response) {
	return new TextDecoder().decode(await response.arrayBuffer());
}

describe('public cache contracts', () => {
	it('resolves a mutable media alias to an immutable revision', async () => {
		const media = await seedMedia('hero.png', 'original');
		const response = await serveMediaAlias('hero.png');

		expect(response.status).toBe(302);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(
			'no-store',
		);
		expect(response.headers.get('location')).toBe(
			`https://cms.test/edge-cms/public/media/revisions/${media.id}/hero.png`,
		);

		const revision = await serveMediaRevision(media.id, 'hero.png');
		expect(revision.status).toBe(200);
		expect(await responseText(revision)).toBe('original');
		expect(revision.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);
		expect(revision.headers.get('cloudflare-cdn-cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);

		const notModified = await serveMediaRevision(
			media.id,
			'hero.png',
			new Request(response.headers.get('location')!, {
				headers: { 'If-None-Match': revision.headers.get('etag')! },
			}),
		);
		expect(notModified.status).toBe(304);
	});

	it('changes the media revision URL on replacement and preserves older bytes', async () => {
		const original = await seedMedia('hero.png', 'original');
		const apiKey = await createApiKey();
		const originalLocation = (await serveMediaAlias('hero.png')).headers.get(
			'location',
		);
		const replacement = await replacementRequest(
			apiKey,
			original.id,
			'replacement',
		);
		const resource = (await replacement.json()) as {
			id: number;
			revisionUrl: string;
		};
		const replacementLocation = (await serveMediaAlias('hero.png')).headers.get(
			'location',
		);

		expect(replacement.status).toBe(200);
		expect(resource.revisionUrl).toBe(replacementLocation);
		expect(replacementLocation).not.toBe(originalLocation);
		await expect(
			serveMediaRevision(original.id, 'hero.png').then(responseText),
		).resolves.toBe('original');
		await expect(
			serveMediaRevision(resource.id, 'hero.png').then(responseText),
		).resolves.toBe('replacement');
	});

	it('allocates a new revision when replacing through an archived media ID', async () => {
		const original = await seedMedia('hero.png', 'version one');
		const apiKey = await createApiKey();

		for (const body of ['version two', 'version three']) {
			const response = await replacementRequest(apiKey, original.id, body);
			expect(response.status).toBe(200);
		}

		await expect(
			env.MEDIA_BUCKET.get('hero.png-v2').then(file => file?.text()),
		).resolves.toBe('version two');
		await expect(
			env.MEDIA_BUCKET.get('hero.png-v3').then(file => file?.text()),
		).resolves.toBe('version three');
	});

	it('resolves the media alias through the selected live revision', async () => {
		const original = await seedMedia('hero.png', 'original');
		const apiKey = await createApiKey();
		await replacementRequest(apiKey, original.id, 'replacement');

		await markMediaLive(original.id);
		const response = await serveMediaAlias('hero.png');

		expect(response.headers.get('location')).toBe(
			`https://cms.test/edge-cms/public/media/revisions/${original.id}/hero.png`,
		);
	});
});
