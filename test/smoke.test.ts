import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { requireApiKey } from '~/utils/auth.middleware';
import { apiRequest, createApiKey, resetDb } from './helpers';

beforeEach(resetDb);

it('has a migrated D1 database', async () => {
	const { results } = await env.DB.prepare(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('languages', 'sections', 'translation_keys')",
	).all();

	expect(results.map(r => r.name).sort()).toEqual([
		'languages',
		'sections',
		'translation_keys',
	]);
});

it('accepts a real API key issued by better-auth', async () => {
	const key = await createApiKey();

	const result = await requireApiKey(apiRequest('/whatever', key), env);

	expect(result.valid).toBe(true);
	expect(result.key.userId).toMatch(/^user_/);
});

it('rejects a request with no API key', async () => {
	const request = new Request('https://cms.test/whatever');

	await expect(requireApiKey(request, env)).rejects.toMatchObject({
		status: 401,
	});
});
