interface TranslationCoverageInput {
	languageCount: number;
	translationCount: number;
	translationKeyCount: number;
}

export function calculateTranslationCoverage({
	languageCount,
	translationCount,
	translationKeyCount,
}: TranslationCoverageInput) {
	const translationTotal = languageCount * translationKeyCount;

	if (translationTotal === 0) return null;

	return Math.round((translationCount / translationTotal) * 100);
}
