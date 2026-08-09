import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { loader } from '~/routes/edge-cms/api/i18n.stale';
import { createSection } from '~/utils/db/sections.server';
import { setDefaultLanguage } from '~/utils/db/languages.server';
import {
	bulkUpsertTranslations,
	getTranslations,
	markTranslationCurrent,
	upsertTranslation,
} from '~/utils/db/translations.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
});

interface StaleReport {
	defaultLocale: string;
	totalStale: number;
	locales: Record<
		string,
		{
			staleCount: number;
			keys: {
				key: string;
				section: string | null;
				defaultValue: string;
				currentValue: string;
			}[];
		}
	>;
}

function report(locale?: string) {
	const query = locale == null ? '' : `?locale=${encodeURIComponent(locale)}`;
	return loader({
		request: apiRequest(`/edge-cms/api/i18n/stale${query}`, apiKey),
	} as never);
}

function readReport(locale?: string) {
	return report(locale).then(r => r.json()) as Promise<StaleReport>;
}

/** A key translated into Spanish and French, everything in sync. */
async function seedTranslatedKey() {
	await seedLanguage('en', true);
	await seedLanguage('es', false);
	await seedLanguage('fr', false);

	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.title', 'es', 'Bienvenido');
	await upsertTranslation('home.title', 'fr', 'Bienvenue');
}

/** A default value from before hashes were recorded: real text, no hash. */
async function seedUntrackedSource() {
	await seedLanguage('en', true);
	await seedLanguage('es', false);
	await env.DB.prepare(
		`INSERT INTO translation_keys (key, section) VALUES ('home.title', NULL)`,
	).run();
	await env.DB.prepare(
		`INSERT INTO translations (key, language, value) VALUES ('home.title', 'en', 'Welcome')`,
	).run();
}

describe('detecting translations left behind by the default locale', () => {
	it('reports nothing while the default value stands still', async () => {
		await seedTranslatedKey();

		const body = await readReport();

		expect(body.totalStale).toBe(0);
	});

	it('flags every locale once the default value changes', async () => {
		await seedTranslatedKey();

		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport();
		expect(body.totalStale).toBe(2);
		expect(body.locales.es).toEqual({
			staleCount: 1,
			keys: [
				{
					key: 'home.title',
					section: null,
					defaultValue: 'Welcome back',
					currentValue: 'Bienvenido',
				},
			],
		});
	});

	it('clears the flag for a locale that is retranslated', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		await upsertTranslation('home.title', 'es', 'Bienvenido de nuevo');

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(0);
		expect(body.locales.fr.staleCount).toBe(1);
	});

	it('clears the flag for a locale imported in bulk', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		// The JSON import path, which writes a whole locale at once.
		await bulkUpsertTranslations('es', { 'home.title': 'Bienvenido de nuevo' });

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(0);
		expect(body.locales.fr.staleCount).toBe(1);
	});

	it('keeps the flag when a translation answers superseded source text', async () => {
		await seedTranslatedKey();

		// An editor moves the source on while a translation of the old text is
		// still in flight — what a long-running AI run races against.
		await upsertTranslation('home.title', 'en', 'Welcome back');
		await bulkUpsertTranslations(
			'es',
			{ 'home.title': 'Bienvenido' },
			{ translatedFrom: { 'home.title': 'Welcome' } },
		);

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(1);
	});

	it('clears the flag when a translation is confirmed as still current', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome!');

		await markTranslationCurrent('home.title', 'es');

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(0);
		expect(body.locales.fr.staleCount).toBe(1);
	});

	it('leaves the default locale itself out of the report', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport();

		expect(Object.keys(body.locales).sort()).toEqual(['es', 'fr']);
	});

	it('reports the section a key belongs to', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await createSection('homepage');
		await upsertTranslation('home.title', 'en', 'Welcome', 'homepage');
		await upsertTranslation('home.title', 'es', 'Bienvenido', 'homepage');

		await upsertTranslation('home.title', 'en', 'Welcome back', 'homepage');

		const body = await readReport();
		expect(body.locales.es.keys[0].section).toBe('homepage');
	});
});

describe('what does not count as stale', () => {
	it('ignores a rewrite of the default value with the same text', async () => {
		await seedTranslatedKey();

		// What `edgecms push` does when the source file has not changed.
		await bulkUpsertTranslations('en', { 'home.title': 'Welcome' });

		const body = await readReport();
		expect(body.totalStale).toBe(0);
	});

	it('ignores an untranslated key, which is missing rather than stale', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', '');

		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport();
		expect(body.totalStale).toBe(0);
	});

	it('ignores translations written before the default value was ever tracked', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		// Rows predating this feature carry no record of what they answered.
		await env.DB.prepare(
			`INSERT INTO translation_keys (key, section) VALUES ('home.title', NULL)`,
		).run();
		await env.DB.prepare(
			`INSERT INTO translations (key, language, value) VALUES ('home.title', 'en', 'Welcome'), ('home.title', 'es', 'Bienvenido')`,
		).run();

		const body = await readReport();

		expect(body.totalStale).toBe(0);
	});

	it('ignores a translation of a default value that was never hashed', async () => {
		await seedUntrackedSource();

		// The first AI run on such a catalogue, recording the text it worked from.
		await bulkUpsertTranslations(
			'es',
			{ 'home.title': 'Bienvenido' },
			{ translatedFrom: { 'home.title': 'Welcome' } },
		);

		const body = await readReport();

		expect(body.totalStale).toBe(0);
	});

	it('ignores a key whose default value has been cleared', async () => {
		await seedTranslatedKey();

		await upsertTranslation('home.title', 'en', '');

		const body = await readReport();
		expect(body.totalStale).toBe(0);
	});
});

describe('catching up with a catalogue that predates hashing', () => {
	it('flags a translation once the default value it answered changes', async () => {
		await seedUntrackedSource();
		await bulkUpsertTranslations(
			'es',
			{ 'home.title': 'Bienvenido' },
			{ translatedFrom: { 'home.title': 'Welcome' } },
		);

		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(1);
	});

	it('flags an untracked translation too, once the default value changes', async () => {
		await seedUntrackedSource();
		await env.DB.prepare(
			`INSERT INTO translations (key, language, value) VALUES ('home.title', 'es', 'Bienvenido')`,
		).run();

		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport();
		expect(body.locales.es.staleCount).toBe(1);
	});

	it('stops flagging a locale once the default value is changed back', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');
		expect((await readReport()).totalStale).toBe(2);

		await upsertTranslation('home.title', 'en', 'Welcome');

		expect((await readReport()).totalStale).toBe(0);
	});
});

describe('changing which locale is the source', () => {
	it('starts over when the default locale itself changes', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		// Hashes recorded against English say nothing about Spanish.
		await setDefaultLanguage('es');

		const body = await readReport();
		expect(body.defaultLocale).toBe('es');
		expect(body.totalStale).toBe(0);
	});

	it('keeps the flags when the locale that is already default is set again', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		await setDefaultLanguage('en');

		expect((await readReport()).totalStale).toBe(2);
	});
});

describe('narrowing to one locale', () => {
	it('reports only the requested locale', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		const body = await readReport('es');

		expect(Object.keys(body.locales)).toEqual(['es']);
		expect(body.totalStale).toBe(1);
	});

	it('404s for a locale that does not exist', async () => {
		await seedTranslatedKey();

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
		const request = new Request('https://cms.test/edge-cms/api/i18n/stale');

		await expect(loader({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
	});
});

describe('flagging individual translations', () => {
	it('marks the affected ones so an editor can see what to revisit', async () => {
		await seedTranslatedKey();
		await upsertTranslation('home.title', 'en', 'Welcome back');

		const rows = await getTranslations({ key: 'home.title' });

		expect(
			Object.fromEntries(rows.map(row => [row.language, row.stale])),
		).toEqual({ en: false, es: true, fr: true });
	});

	it('returns one row per translation even if two locales claim to be default', async () => {
		await seedTranslatedKey();
		// Nothing in the schema enforces a single default, and a duplicated row
		// would render every cell in the grid twice.
		await env.DB.prepare(
			`UPDATE languages SET "default" = 1 WHERE locale = 'es'`,
		).run();

		const rows = await getTranslations({ key: 'home.title' });

		expect(rows.map(row => row.language).sort()).toEqual(['en', 'es', 'fr']);
	});
});
