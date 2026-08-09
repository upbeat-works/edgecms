import { beforeEach, describe, expect, it } from 'vitest';
import { action as pushTranslations } from '~/routes/edge-cms/api/i18n.push';
import { loader as staleTranslations } from '~/routes/edge-cms/api/i18n.stale';
import { upsertTranslation } from '~/utils/db/translations.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
	await seedLanguage('en', true);
	await seedLanguage('es');
	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.title', 'es', 'Bienvenido');
});

function push(locale: string, translations: Record<string, string>) {
	return pushTranslations({
		request: apiRequest('/edge-cms/api/i18n/push', apiKey, {
			method: 'POST',
			body: JSON.stringify({ locale, translations }),
		}),
	} as never);
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

	it('rejects a catalogue that is not the CMS default locale', async () => {
		const response = await push('es', { 'home.title': 'Bienvenidos' });

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'DEFAULT_LOCALE_MISMATCH',
		});
	});
});
