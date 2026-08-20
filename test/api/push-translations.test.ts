import { beforeEach, describe, expect, it } from 'vitest';
import { loader as pullTranslations } from '~/routes/edge-cms/api/i18n.pull';
import { action as pushTranslations } from '~/routes/edge-cms/api/i18n.push';
import { loader as staleTranslations } from '~/routes/edge-cms/api/i18n.stale';
import {
	getTranslations,
	upsertTranslation,
} from '~/utils/db/translations.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;
let baseRevision: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
	await seedLanguage('en', true);
	await seedLanguage('es');
	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.title', 'es', 'Bienvenido');
	baseRevision = await pullRevision();
});

function push(
	locale: string,
	translations: Record<string, string>,
	revision = baseRevision,
) {
	return pushTranslations({
		request: apiRequest('/edge-cms/api/i18n/push', apiKey, {
			method: 'POST',
			body: JSON.stringify({ locale, translations, baseRevision: revision }),
		}),
	} as never);
}

async function pullRevision() {
	const response = await pullTranslations({
		request: apiRequest('/edge-cms/api/i18n/pull', apiKey),
	} as never);
	const body = (await response.json()) as { revision: string };
	return body.revision;
}

async function stale() {
	const response = await staleTranslations({
		request: apiRequest('/edge-cms/api/i18n/stale', apiKey),
	} as never);
	return response.json() as Promise<{
		totalStale: number;
		locales: Record<string, { keys: { key: string }[] }>;
	}>;
}

describe('pushing the source catalogue', () => {
	it('marks existing translations stale when source content changes', async () => {
		const response = await push('en', { 'home.title': 'Welcome back' });

		expect(response.status).toBe(200);
		await expect(stale()).resolves.toMatchObject({
			totalStale: 1,
			locales: { es: { keys: [{ key: 'home.title' }] } },
		});
	});

	it('accepts a subsequent push based on the revision returned by the first', async () => {
		const firstResponse = await push('en', {
			'home.title': 'Welcome back',
		});
		const firstPush = (await firstResponse.json()) as { revision: string };

		const secondResponse = await push(
			'en',
			{ 'home.title': 'Welcome again' },
			firstPush.revision,
		);

		expect(secondResponse.status).toBe(200);
	});

	it('rejects a catalogue that is not the CMS default locale', async () => {
		const response = await push('es', { 'home.title': 'Bienvenidos' });

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'DEFAULT_LOCALE_MISMATCH',
		});
	});

	it('rejects clients that do not identify the catalogue they started from', async () => {
		const response = await pushTranslations({
			request: apiRequest('/edge-cms/api/i18n/push', apiKey, {
				method: 'POST',
				body: JSON.stringify({
					locale: 'en',
					translations: { 'home.title': 'Welcome back' },
				}),
			}),
		} as never);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'VALIDATION_ERROR',
			path: 'baseRevision',
		});
	});

	it('leaves editor changes untouched when the pushed catalogue has an older base', async () => {
		await upsertTranslation('home.title', 'en', 'Edited in the CMS');

		const response = await push(
			'en',
			{ 'home.title': 'Changed in code' },
			baseRevision,
		);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'CATALOGUE_CONFLICT',
		});
		await expect(
			getTranslations({ key: 'home.title', language: 'en' }),
		).resolves.toMatchObject([{ value: 'Edited in the CMS' }]);
	});
});
