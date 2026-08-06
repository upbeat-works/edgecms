import { beforeEach, describe, expect, it } from 'vitest';
import {
	createLanguage,
	setDefaultLanguage,
} from '~/utils/services/languages.server';
import { getLanguages } from '~/utils/db/languages.server';
import { resetDb, seedLanguage } from '../helpers';

beforeEach(resetDb);

// The REST and RPC adapters always pass an options object; these cover the
// service's own contract when called directly.
describe('the languages service called without options', () => {
	it('creates a language', async () => {
		const result = await createLanguage('en');

		expect(result).toEqual({ ok: true, data: { locale: 'en', default: true } });
		expect(await getLanguages()).toEqual([{ locale: 'en', default: true }]);
	});

	it('sets a default language', async () => {
		await seedLanguage('en', true);
		await seedLanguage('es', false);

		const result = await setDefaultLanguage('es');

		expect(result).toEqual({ ok: true, data: { locale: 'es', default: true } });
	});
});

describe('locale canonicalisation', () => {
	it('normalises casing so a language cannot be created twice', async () => {
		await createLanguage('pt-br');

		expect(await getLanguages()).toEqual([{ locale: 'pt-BR', default: true }]);

		const duplicate = await createLanguage('PT-BR');
		expect(duplicate).toMatchObject({
			ok: false,
			error: { code: 'LOCALE_EXISTS' },
		});
	});

	it('matches an existing language regardless of the casing requested', async () => {
		await seedLanguage('en', true);
		await seedLanguage('pt-BR', false);

		const result = await setDefaultLanguage('pt-br');

		expect(result).toMatchObject({ ok: true, data: { locale: 'pt-BR' } });
	});
});
