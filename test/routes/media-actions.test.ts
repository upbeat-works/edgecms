import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/media/media';
import { getMedia } from '~/utils/db/media.server';
import { authedRequest, resetDb, seedMedia, signIn } from '../helpers';

let cookie: string;

beforeEach(async () => {
	await resetDb();
	cookie = await signIn();
});

describe('media administration', () => {
	it('renames a media file and all of its revisions', async () => {
		const media = await seedMedia('hero.png', 'hero');
		const body = new FormData();
		body.set('intent', 'rename');
		body.set('mediaId', String(media.id));
		body.set('filename', 'homepage-hero.png');

		const response = await action({
			request: authedRequest('/edge-cms/media', cookie, {
				method: 'POST',
				body,
			}),
		} as never);

		expect(response).toEqual({
			success: true,
			filename: 'homepage-hero.png',
		});
		await expect(
			getMedia({ filename: 'homepage-hero.png' }),
		).resolves.toHaveLength(1);
		await expect(
			env.MEDIA_BUCKET.get('homepage-hero.png').then(file => file?.text()),
		).resolves.toBe('hero');
	});
});
