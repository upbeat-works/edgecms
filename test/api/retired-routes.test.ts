import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('retired product routes', () => {
	it('does not expose the legal consent handler', async () => {
		const response = await SELF.fetch(
			'https://cms.test/edge-cms/consent/subjects',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			},
		);

		expect(response.status).toBe(404);
	});
});
