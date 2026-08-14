import { describe, expect, it } from 'vitest';
import { calculateTranslationCoverage } from '~/utils/translation-coverage';

describe('translation coverage', () => {
	it('is not applicable when a section has no translatable keys', () => {
		expect(
			calculateTranslationCoverage({
				languageCount: 2,
				translationCount: 0,
				translationKeyCount: 0,
			}),
		).toBeNull();
	});

	it('reports the percentage of translated values', () => {
		expect(
			calculateTranslationCoverage({
				languageCount: 2,
				translationCount: 3,
				translationKeyCount: 2,
			}),
		).toBe(75);
	});
});
