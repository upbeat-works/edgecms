import type { GridChildComponentProps } from 'react-window';
import { SectionCell } from './section-cell';
import { TranslationCell } from './translation-cell';
import type { Language, Section, Translation } from '~/utils/db.server';

export function VirtualizedCell({
	columnIndex,
	rowIndex,
	style,
	data,
}: GridChildComponentProps<{
	translationKeys: string[];
	translations: Map<string, Map<string, Translation>>;
	sortedLanguages: Language[];
	sections: Section[];
}>) {
	const { translationKeys, translations, sortedLanguages, sections } = data;

	// Data rows only (header is rendered separately)
	const dataIndex = rowIndex;
	const key = translationKeys[dataIndex];
	const keyTranslations = translations.get(key)!;
	const firstTranslation = Array.from(keyTranslations.values())[0];
	const section = firstTranslation?.section;

	// Section column (now at index 0)
	if (columnIndex === 0) {
		return (
			<div style={style} className="flex items-center border-r border-b p-2">
				<SectionCell
					translationKey={key}
					currentSection={section}
					sections={sections}
				/>
			</div>
		);
	} else {
		// Language columns
		const langIndex = columnIndex - 1;
		const lang = sortedLanguages[langIndex];
		return (
			<div
				style={style}
				className={`flex items-center border-r border-b p-2 ${lang.default ? 'bg-blue-50' : ''}`}
			>
				<TranslationCell
					translationKey={key}
					language={lang.locale}
					translation={keyTranslations.get(lang.locale)}
					section={section}
				/>
			</div>
		);
	}
}
