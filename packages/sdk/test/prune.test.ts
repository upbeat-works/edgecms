import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prune } from '../src/commands/keys.js';
import { fakeCMS, projectDir } from './helpers.js';

let cms: ReturnType<typeof fakeCMS>;

beforeEach(() => {
	cms = fakeCMS();
	cms.install();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** A CMS holding `remote`, and a local en.json holding `local`. */
async function setup(
	remote: Record<string, string>,
	local: Record<string, string> | string,
) {
	cms.translations.en = { ...remote };
	const { config } = await projectDir({ 'locales/en.json': local });
	return config;
}

describe('choosing what to delete', () => {
	it('asks to delete exactly the keys the CMS has and the file does not', async () => {
		const config = await setup(
			{ 'home.title': 'Home', 'home.stale': 'Old', 'checkout.gone': 'Old' },
			{ 'home.title': 'Home' },
		);

		await prune(config, { yes: true });

		expect(cms.deleteRequests).toEqual([
			{ keys: ['home.stale', 'checkout.gone'], dryRun: false },
		]);
		expect(cms.translations.en).toEqual({ 'home.title': 'Home' });
	});

	it('deletes nothing without --yes', async () => {
		const config = await setup(
			{ 'home.title': 'Home', 'home.stale': 'Old' },
			{ 'home.title': 'Home' },
		);

		await prune(config);

		expect(cms.deleteRequests).toEqual([
			{ keys: ['home.stale'], dryRun: true },
		]);
		expect(cms.translations.en).toEqual({
			'home.title': 'Home',
			'home.stale': 'Old',
		});
	});

	it('asks for nothing when the CMS holds no extra keys', async () => {
		const config = await setup(
			{ 'home.title': 'Home' },
			{ 'home.title': 'Home', 'home.new': 'Not pushed yet' },
		);

		await expect(prune(config, { yes: true })).resolves.toBeNull();
		expect(cms.deleteRequests).toEqual([]);
	});
});

// The local file is the entire basis for deciding a key is unused, so prune
// refuses whenever it cannot trust it — a broken build that emits an empty or
// malformed file must not read as "every key in the CMS is dead".
describe('refusing to run on a file it cannot trust', () => {
	it('refuses when the file has no keys', async () => {
		const config = await setup({ 'home.title': 'Home' }, {});

		await expect(prune(config, { yes: true })).rejects.toThrow(
			/contains no keys/,
		);
		expect(cms.deleteRequests).toEqual([]);
	});

	it('refuses when the file is not an object of translations', async () => {
		const config = await setup({ 'home.title': 'Home' }, 'null');

		await expect(prune(config, { yes: true })).rejects.toThrow(
			/not a JSON object/,
		);
		expect(cms.deleteRequests).toEqual([]);
	});

	it('refuses when the file is missing', async () => {
		cms.translations.en = { 'home.title': 'Home' };
		const { config } = await projectDir();

		await expect(prune(config, { yes: true })).rejects.toThrow(
			/Translations file not found/,
		);
		expect(cms.deleteRequests).toEqual([]);
	});

	it('refuses when the file is not valid JSON', async () => {
		const config = await setup({ 'home.title': 'Home' }, 'not json at all');

		await expect(prune(config, { yes: true })).rejects.toThrow(
			/Failed to parse/,
		);
		expect(cms.deleteRequests).toEqual([]);
	});
});
