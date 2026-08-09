import { beforeEach, describe, expect, it } from 'vitest';
import { getLanguages, getDefaultLocale } from '~/utils/db/languages.server';
import { createSection, getSections } from '~/utils/db/sections.server';
import {
	getExistingTranslationKeys,
	getTranslations,
	restoreTranslationsFromBackup,
	upsertTranslation,
	type TranslationsBackup,
} from '~/utils/db/translations.server';
import { resetDb, seedBlockCollection, seedLanguage } from '../helpers';

beforeEach(resetDb);

function backup(
	overrides: Partial<TranslationsBackup> = {},
): TranslationsBackup {
	return {
		formatVersion: 2,
		defaultLocale: 'en',
		locales: ['en', 'es'],
		translations: [
			{
				key: 'home.title',
				language: 'en',
				value: 'Welcome',
				section: null,
				sourceHash: 'abc',
			},
			{
				key: 'home.title',
				language: 'es',
				value: 'Bienvenido',
				section: null,
				sourceHash: 'abc',
			},
		],
		...overrides,
	};
}

function restore(raw: unknown, fallbackDefaultLocale: string | null = null) {
	return restoreTranslationsFromBackup(raw, { fallbackDefaultLocale });
}

describe('restoring a released snapshot', () => {
	it('brings back every translation', async () => {
		await restore(backup());

		const rows = await getTranslations({});
		expect(rows.map(row => `${row.language}:${row.value}`).sort()).toEqual([
			'en:Welcome',
			'es:Bienvenido',
		]);
	});

	it('restores the default locale by name, not by position', async () => {
		// The locale everything was translated from, holding no translations of
		// its own — the case that silently promoted the next locale before.
		await restore(
			backup({
				defaultLocale: 'en',
				locales: ['en', 'es'],
				translations: [
					{
						key: 'home.title',
						language: 'es',
						value: 'Bienvenido',
						section: null,
						sourceHash: null,
					},
				],
			}),
		);

		await expect(getDefaultLocale()).resolves.toBe('en');
	});

	it('brings back a locale that holds no translations', async () => {
		await restore(backup({ locales: ['en', 'es', 'fr'] }));

		expect((await getLanguages()).map(l => l.locale)).toEqual([
			'en',
			'es',
			'fr',
		]);
	});

	it('brings back the keys and sections its translations depend on', async () => {
		await restore(
			backup({
				translations: [
					{
						key: 'home.title',
						language: 'en',
						value: 'Welcome',
						section: 'homepage',
						sourceHash: null,
					},
				],
			}),
		);

		expect((await getSections()).map(s => s.name)).toEqual(['homepage']);
		const [row] = await getTranslations({ key: 'home.title' });
		expect(row.section).toBe('homepage');
	});

	it('restores more rows than fit in a single statement', async () => {
		const many = Array.from({ length: 120 }, (_, i) => ({
			key: `bulk.key${i}`,
			language: 'en',
			value: `value ${i}`,
			section: null,
			sourceHash: null,
		}));

		await restore(backup({ locales: ['en'], translations: many }));

		expect(await getTranslations({ language: 'en' })).toHaveLength(120);
	});

	it('can be applied twice, as a retried workflow step would', async () => {
		await restore(backup());
		await restore(backup());

		expect(await getTranslations({})).toHaveLength(2);
	});

	it('recomputes staleness from the restored hashes', async () => {
		await restore(
			backup({
				translations: [
					{
						key: 'home.title',
						language: 'en',
						value: 'Welcome back',
						section: null,
						sourceHash: 'new',
					},
					{
						key: 'home.title',
						language: 'es',
						value: 'Bienvenido',
						section: null,
						sourceHash: 'old',
					},
				],
			}),
		);

		const rows = await getTranslations({ key: 'home.title' });
		expect(Object.fromEntries(rows.map(r => [r.language, r.stale]))).toEqual({
			en: false,
			es: true,
		});
	});
});

describe('restoring over content the backup does not describe', () => {
	it('leaves a block-owned key and its section standing', async () => {
		await seedLanguage('en', true);
		await createSection('marketing');
		const { collection } = await seedBlockCollection('hero');
		const blockKey = `blocks.${collection.name}.heading`;
		await upsertTranslation(blockKey, 'en', 'Owned by a block', 'marketing');

		// A snapshot taken before any of that existed.
		await restore(backup());

		// The block's own translation goes, since the backup replaces every
		// translation — but the key and section it depends on must survive, or
		// the block editor has nothing to write back into.
		await expect(getExistingTranslationKeys([blockKey])).resolves.toEqual([
			blockKey,
		]);
		expect((await getSections()).map(s => s.name)).toContain('marketing');
	});

	it('does not resurrect a section the backup never mentioned', async () => {
		await restore(backup());

		expect(await getSections()).toHaveLength(0);
	});
});

describe('refusing a backup it cannot read', () => {
	it('leaves the catalogue standing when the payload is malformed', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');

		await expect(restore({ formatVersion: 2 })).rejects.toThrow();

		expect(await getTranslations({})).toHaveLength(1);
		await expect(getDefaultLocale()).resolves.toBe('en');
	});

	it('refuses a default locale missing from its own locale list', async () => {
		await expect(restore(backup({ defaultLocale: 'de' }))).rejects.toThrow();
	});
});

describe('reading a backup written before the format carried the default locale', () => {
	it('takes the default from the first group when it has rows', async () => {
		await restore([
			[{ key: 'home.title', language: 'en', value: 'Welcome' }],
			[{ key: 'home.title', language: 'es', value: 'Bienvenido' }],
		]);

		await expect(getDefaultLocale()).resolves.toBe('en');
	});

	it('falls back to the current default when the first group is empty', async () => {
		await restore(
			[[], [{ key: 'home.title', language: 'es', value: 'Bienvenido' }]],
			'en',
		);

		await expect(getDefaultLocale()).resolves.toBe('en');
		expect((await getLanguages()).map(l => l.locale).sort()).toEqual([
			'en',
			'es',
		]);
	});

	it('settles for the first locale holding rows when nothing else is known', async () => {
		await restore(
			[[], [{ key: 'home.title', language: 'es', value: 'Bienvenido' }]],
			null,
		);

		await expect(getDefaultLocale()).resolves.toBe('es');
	});

	it('ignores the derived stale flag such a backup carried', async () => {
		await restore([
			[
				{
					key: 'home.title',
					language: 'en',
					value: 'Welcome',
					section: null,
					sourceHash: null,
					stale: true,
				},
			],
		]);

		const [row] = await getTranslations({ key: 'home.title' });
		expect(row.stale).toBe(false);
	});
});
