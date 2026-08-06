import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/i18n.languages';
import { getLanguages } from '~/utils/db/languages.server';
import { getLatestVersion } from '~/utils/db/versions.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

function post(body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/i18n/languages', apiKey, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	} as never);
}

function patch(body: unknown) {
	return action({
		request: apiRequest('/edge-cms/api/i18n/languages', apiKey, {
			method: 'PATCH',
			body: JSON.stringify(body),
		}),
	} as never);
}

describe('creating a language', () => {
	it('creates the language and returns it', async () => {
		const response = await post({ locale: 'en' });

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			locale: 'en',
			default: true,
		});
		expect(await getLanguages()).toEqual([{ locale: 'en', default: true }]);
	});

	it('makes the first language the default, but not later ones', async () => {
		await post({ locale: 'en' });
		const response = await post({ locale: 'es' });

		await expect(response.json()).resolves.toEqual({
			locale: 'es',
			default: false,
		});
		expect(await getLanguages()).toEqual([
			{ locale: 'en', default: true },
			{ locale: 'es', default: false },
		]);
	});

	it('can create a language and make it default in one call', async () => {
		await post({ locale: 'en' });
		await post({ locale: 'es', default: true });

		expect(await getLanguages()).toEqual([
			{ locale: 'en', default: false },
			{ locale: 'es', default: true },
		]);
	});

	it('rejects a duplicate locale without disturbing the existing one', async () => {
		await seedLanguage('en', true);

		const response = await post({ locale: 'en' });

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'LOCALE_EXISTS',
		});
		expect(await getLanguages()).toEqual([{ locale: 'en', default: true }]);
	});

	it('rejects a structurally invalid locale tag', async () => {
		const response = await post({ locale: 'not a locale!' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_LOCALE',
		});
		expect(await getLanguages()).toEqual([]);
	});

	it('rejects a body that is not valid JSON', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/i18n/languages', apiKey, {
				method: 'POST',
				body: 'not json at all',
			}),
		} as never);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_JSON',
		});
	});

	it('rejects a locale that is only whitespace', async () => {
		const response = await post({ locale: '   ' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_LOCALE',
		});
		expect(await getLanguages()).toEqual([]);
	});

	it('rejects a missing locale', async () => {
		const response = await post({});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'VALIDATION_ERROR',
		});
	});

	// The public i18n endpoints serve whatever the last publish wrote, so a new
	// language has to land in a draft version to ever be publishable.
	it('opens a draft version so the change can be published', async () => {
		expect(await getLatestVersion('draft')).toBeNull();

		await post({ locale: 'en' });

		expect(await getLatestVersion('draft')).not.toBeNull();
	});
});

describe('setting the default language', () => {
	it('moves the default flag to the target locale', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);

		const response = await patch({ locale: 'es' });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			locale: 'es',
			default: true,
		});
		expect(await getLanguages()).toEqual([
			{ locale: 'en', default: false },
			{ locale: 'es', default: true },
		]);
	});

	it('leaves exactly one default when called repeatedly', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await seedLanguage('fr', false);

		await patch({ locale: 'es' });
		await patch({ locale: 'fr' });

		const defaults = (await getLanguages()).filter(l => l.default);
		expect(defaults).toEqual([{ locale: 'fr', default: true }]);
	});

	it('rejects a structurally invalid locale tag', async () => {
		await seedLanguage('en', true);

		const response = await patch({ locale: 'not a locale!' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'INVALID_LOCALE',
		});
		expect(await getLanguages()).toEqual([{ locale: 'en', default: true }]);
	});

	it('404s for a locale that does not exist', async () => {
		await seedLanguage('en', true);

		const response = await patch({ locale: 'de' });

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'LOCALE_NOT_FOUND',
		});
		expect(await getLanguages()).toEqual([{ locale: 'en', default: true }]);
	});
});

describe('listing languages', () => {
	it('returns languages and the default locale', async () => {
		await seedLanguage('en', false);
		await seedLanguage('es', true);

		const response = await loader({
			request: apiRequest('/edge-cms/api/i18n/languages', apiKey),
		} as never);

		await expect(response.json()).resolves.toEqual({
			languages: [
				{ locale: 'en', default: false },
				{ locale: 'es', default: true },
			],
			defaultLocale: 'es',
		});
	});

	it('reports a null default when no languages exist', async () => {
		const response = await loader({
			request: apiRequest('/edge-cms/api/i18n/languages', apiKey),
		} as never);

		await expect(response.json()).resolves.toEqual({
			languages: [],
			defaultLocale: null,
		});
	});
});

describe('authentication', () => {
	it('rejects writes without an API key', async () => {
		const request = new Request(
			'https://cms.test/edge-cms/api/i18n/languages',
			{
				method: 'POST',
				body: JSON.stringify({ locale: 'en' }),
			},
		);

		await expect(action({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
		expect(await getLanguages()).toEqual([]);
	});

	it('rejects unsupported methods', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/i18n/languages', apiKey, {
				method: 'DELETE',
				body: JSON.stringify({ locale: 'en' }),
			}),
		} as never);

		expect(response.status).toBe(405);
	});
});
