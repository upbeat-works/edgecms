import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from '~/routes/edge-cms/publish';
import { authedRequest, resetDb, signIn } from '../helpers';

describe('CMS publish form', () => {
	let cookie: string;

	beforeEach(async () => {
		await resetDb();
		cookie = await signIn();
		vi.spyOn(env.RELEASE_VERSION_WORKFLOW, 'create').mockResolvedValue({
			id: 'publish-from-navigation',
		} as never);
	});

	it('redirects an HTML publish form back to its CMS location', async () => {
		const body = new FormData();
		body.set('returnTo', '/edge-cms/workspace?view=compact');

		const response = await action({
			request: authedRequest('/edge-cms/publish', cookie, {
				method: 'POST',
				body,
			}),
		} as never);

		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(
			'/edge-cms/workspace?view=compact&publishId=publish-from-navigation',
		);
	});

	it('does not redirect published sessions outside the CMS', async () => {
		const body = new FormData();
		body.set('returnTo', 'https://attacker.example/collect');

		const response = await action({
			request: authedRequest('/edge-cms/publish', cookie, {
				method: 'POST',
				body,
			}),
		} as never);

		expect(response.headers.get('location')).toBe(
			'/edge-cms?publishId=publish-from-navigation',
		);
	});
});
