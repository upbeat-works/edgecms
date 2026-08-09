import { beforeEach, describe, expect, it } from 'vitest';
import { getKeysToTranslate } from '~/utils/services/translations.server';
import { upsertTranslation } from '~/utils/db/translations.server';
import { resetDb, seedLanguage } from '../helpers';

beforeEach(async () => {
	await resetDb();
	await seedLanguage('en', true);
	await seedLanguage('es', false);
});

function forScope(scope: 'missing' | 'missing-and-stale') {
	return getKeysToTranslate({
		defaultLocale: 'en',
		targetLocale: 'es',
		scope,
	});
}

/**
 * One key Spanish never answered, one it answered against text that has since
 * changed, and one that is fully up to date.
 */
async function seedBacklog() {
	await upsertTranslation('home.subtitle', 'en', 'Get started');

	await upsertTranslation('home.title', 'en', 'Welcome');
	await upsertTranslation('home.title', 'es', 'Bienvenido');
	await upsertTranslation('home.title', 'en', 'Welcome back');

	await upsertTranslation('cta.label', 'en', 'Buy now');
	await upsertTranslation('cta.label', 'es', 'Comprar ahora');
}

describe('choosing what an AI translation run covers', () => {
	it('takes only untranslated keys by default', async () => {
		await seedBacklog();

		const work = await forScope('missing');

		expect(work).toEqual([{ key: 'home.subtitle', value: 'Get started' }]);
	});

	it('adds keys whose source text changed when asked to', async () => {
		await seedBacklog();

		const work = await forScope('missing-and-stale');

		expect(work.map(item => item.key).sort()).toEqual([
			'home.subtitle',
			'home.title',
		]);
	});

	it('translates a stale key from the source text as it now stands', async () => {
		await seedBacklog();

		const work = await forScope('missing-and-stale');

		expect(work).toContainEqual({
			key: 'home.title',
			value: 'Welcome back',
		});
	});

	it('leaves up-to-date translations alone under either scope', async () => {
		await seedBacklog();

		const [missing, andStale] = await Promise.all([
			forScope('missing'),
			forScope('missing-and-stale'),
		]);

		expect(missing.map(item => item.key)).not.toContain('cta.label');
		expect(andStale.map(item => item.key)).not.toContain('cta.label');
	});

	it('asks for a key once even when it is both empty and out of date', async () => {
		await upsertTranslation('cta.label', 'en', 'Buy now');
		await upsertTranslation('cta.label', 'es', 'Comprar ahora');
		await upsertTranslation('cta.label', 'en', 'Buy today');
		// Emptied after the source moved on: missing by one rule, stale by the
		// other, but a single unit of work.
		await upsertTranslation('cta.label', 'es', '');

		const work = await forScope('missing-and-stale');

		expect(work).toEqual([{ key: 'cta.label', value: 'Buy today' }]);
	});

	it('never asks for a translation of a source value that was cleared', async () => {
		await upsertTranslation('cta.label', 'en', 'Buy now');
		await upsertTranslation('cta.label', 'es', 'Comprar ahora');
		// An editor empties the English cell. Sending the empty string to be
		// translated would overwrite a perfectly good Spanish translation.
		await upsertTranslation('cta.label', 'en', '');

		await expect(forScope('missing-and-stale')).resolves.toEqual([]);
	});

	it('finds nothing when a locale is complete and current', async () => {
		await upsertTranslation('cta.label', 'en', 'Buy now');
		await upsertTranslation('cta.label', 'es', 'Comprar ahora');

		await expect(forScope('missing-and-stale')).resolves.toEqual([]);
	});
});
