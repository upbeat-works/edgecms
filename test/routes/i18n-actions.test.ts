import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { action } from '~/routes/edge-cms/i18n/i18n';
import { createSection } from '~/utils/db/sections.server';
import {
	getTranslations,
	upsertTranslation,
} from '~/utils/db/translations.server';
import { getLanguages } from '~/utils/db/languages.server';
import { authedRequest, resetDb, seedLanguage, signIn } from '../helpers';

let cookie: string;

beforeEach(async () => {
	await resetDb();
	cookie = await signIn();
});

/** Submit to the i18n route the way the admin UI does. */
function submit(fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.append(name, value);

	return action({
		request: authedRequest('/edge-cms/i18n', cookie, { method: 'POST', body }),
	} as never);
}

async function seedStaleTranslation() {
	await seedLanguage('en', true);
	await seedLanguage('es', false);
	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.title', 'es', 'Bienvenido');
	await upsertTranslation('home.title', 'en', 'Welcome back');
}

async function staleFlags() {
	const rows = await getTranslations({ key: 'home.title' });
	return Object.fromEntries(rows.map(row => [row.language, row.stale]));
}

describe('confirming a translation is still current', () => {
	it('clears the flag the grid shows on that cell', async () => {
		await seedStaleTranslation();
		expect(await staleFlags()).toMatchObject({ es: true });

		const response = await submit({
			intent: 'mark-translation-current',
			key: 'home.title',
			language: 'es',
		});

		expect(response.status).toBe(200);
		expect(await staleFlags()).toMatchObject({ es: false });
	});

	it('leaves the translation itself untouched', async () => {
		await seedStaleTranslation();

		await submit({
			intent: 'mark-translation-current',
			key: 'home.title',
			language: 'es',
		});

		const [spanish] = await getTranslations({
			key: 'home.title',
			language: 'es',
		});
		expect(spanish.value).toBe('Bienvenido');
	});

	it('turns away a request without a session', async () => {
		const body = new FormData();
		body.append('intent', 'mark-translation-current');

		await expect(
			action({
				request: new Request('https://cms.test/edge-cms/i18n', {
					method: 'POST',
					body,
				}),
			} as never),
		).rejects.toMatchObject({ status: 302 });
	});
});

describe('choosing which locale is the source', () => {
	it('leaves the catalogue alone when the locale does not exist', async () => {
		await seedStaleTranslation();

		await submit({ intent: 'set-default-language', locale: 'de' });

		expect(await getLanguages()).toEqual([
			{ locale: 'en', default: true },
			{ locale: 'es', default: false },
		]);
		expect(await staleFlags()).toMatchObject({ es: true });
	});
});

describe('adding a translation key', () => {
	it('gives every locale an empty value to fill in', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);

		await submit({ intent: 'add-translation', key: 'home.tagline' });

		const rows = await getTranslations({ key: 'home.tagline' });
		expect(rows.map(row => [row.language, row.value])).toEqual([
			['en', ''],
			['es', ''],
		]);
	});

	it('refuses a key that already exists rather than blanking it', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', 'Bienvenido');

		const response = await submit({
			intent: 'add-translation',
			key: 'home.title',
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ success: false });
		const rows = await getTranslations({ key: 'home.title' });
		expect(rows.map(row => row.value)).toEqual(['Welcome', 'Bienvenido']);
	});

	it('lets a key stripped of its translations be added back', async () => {
		await seedLanguage('en', true);
		await createSection('homepage');
		// What a rollback leaves behind for a key added after the release: the key
		// row survives, its translations do not, and the grid cannot show it.
		await submit({ intent: 'add-translation', key: 'added.later' });
		await env.DB.prepare(`DELETE FROM translations WHERE key = ?`)
			.bind('added.later')
			.run();

		await submit({
			intent: 'add-translation',
			key: 'added.later',
			section: 'homepage',
		});

		const [row] = await getTranslations({ key: 'added.later' });
		expect(row).toMatchObject({ value: '', section: 'homepage' });
	});

	it('refuses a key that is blank', async () => {
		await seedLanguage('en', true);

		const response = await submit({ intent: 'add-translation', key: '   ' });

		expect(response.status).toBe(400);
		expect(await getTranslations({})).toHaveLength(0);
	});

	it('stores a padded key without its surrounding whitespace', async () => {
		await seedLanguage('en', true);

		await submit({ intent: 'add-translation', key: '  home.tagline  ' });

		const [row] = await getTranslations({});
		expect(row.key).toBe('home.tagline');
	});

	it('refuses a padded key that names one already in use', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');

		const response = await submit({
			intent: 'add-translation',
			key: ' home.title ',
		});

		expect(response.status).toBe(400);
		expect((await getTranslations({})).map(row => row.key)).toEqual([
			'home.title',
		]);
	});

	it('records the section the key was filed under', async () => {
		await seedLanguage('en', true);
		await createSection('homepage');

		await submit({
			intent: 'add-translation',
			key: 'home.tagline',
			section: 'homepage',
		});

		const [row] = await getTranslations({ key: 'home.tagline' });
		expect(row.section).toBe('homepage');
	});
});
