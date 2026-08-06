import { beforeEach, describe, expect, it } from 'vitest';
import { loader } from '~/routes/edge-cms/api/i18n.missing';
import { createSection } from '~/utils/db/sections.server';
import { upsertTranslation } from '~/utils/db/translations.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

interface MissingReport {
	defaultLocale: string;
	totalMissing: number;
	locales: Record<
		string,
		{
			missingCount: number;
			keys: { key: string; section: string | null; defaultValue: string }[];
		}
	>;
}

function report(locale?: string) {
	const query = locale == null ? '' : `?locale=${encodeURIComponent(locale)}`;
	return loader({
		request: apiRequest(`/edge-cms/api/i18n/missing${query}`, apiKey),
	} as never);
}

async function seedBaseline() {
	await seedLanguage('en', true);
	await seedLanguage('es', false);
	await seedLanguage('fr', false);

	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.subtitle', 'en', 'Get started');

	// Spanish has one of the two, French has neither.
	await upsertTranslation('home.title', 'es', 'Bienvenido');
}

describe('reporting missing translations', () => {
	it('lists keys absent from a target locale', async () => {
		await seedBaseline();

		const response = await report();

		expect(response.status).toBe(200);
		const body = (await response.json()) as MissingReport;
		expect(body.defaultLocale).toBe('en');
		expect(body.locales.es).toEqual({
			missingCount: 1,
			keys: [
				{ key: 'home.subtitle', section: null, defaultValue: 'Get started' },
			],
		});
	});

	it('counts a key present but empty as missing', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('cta.label', 'en', 'Buy now');
		await upsertTranslation('cta.label', 'es', '');

		const body = (await report().then(r => r.json())) as MissingReport;

		expect(body.locales.es.keys.map(k => k.key)).toEqual(['cta.label']);
	});

	it('totals across every non-default locale', async () => {
		await seedBaseline();

		const body = (await report().then(r => r.json())) as MissingReport;

		// es is missing 1, fr is missing both.
		expect(body.locales.fr.missingCount).toBe(2);
		expect(body.totalMissing).toBe(3);
	});

	it('excludes the default locale from the report', async () => {
		await seedBaseline();

		const body = (await report().then(r => r.json())) as MissingReport;

		expect(Object.keys(body.locales).sort()).toEqual(['es', 'fr']);
	});

	it('reports nothing missing when every locale is complete', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', 'Bienvenido');

		const body = (await report().then(r => r.json())) as MissingReport;

		expect(body.totalMissing).toBe(0);
		expect(body.locales.es).toEqual({ missingCount: 0, keys: [] });
	});

	it('includes the section a key belongs to', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await createSection('homepage');
		await upsertTranslation('home.title', 'en', 'Welcome', 'homepage');

		const body = (await report().then(r => r.json())) as MissingReport;

		expect(body.locales.es.keys[0]).toEqual({
			key: 'home.title',
			section: 'homepage',
			defaultValue: 'Welcome',
		});
	});
});

describe('narrowing to one locale', () => {
	it('reports only the requested locale', async () => {
		await seedBaseline();

		const body = (await report('es').then(r => r.json())) as MissingReport;

		expect(Object.keys(body.locales)).toEqual(['es']);
		expect(body.totalMissing).toBe(1);
	});

	it('404s for a locale that does not exist', async () => {
		await seedBaseline();

		const response = await report('de');

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'LOCALE_NOT_FOUND',
		});
	});
});

describe('preconditions', () => {
	it('409s when no default language is set', async () => {
		await seedLanguage('en', false);

		const response = await report();

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'NO_DEFAULT_LANGUAGE',
		});
	});

	it('rejects requests without an API key', async () => {
		const request = new Request('https://cms.test/edge-cms/api/i18n/missing');

		await expect(loader({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
	});
});
