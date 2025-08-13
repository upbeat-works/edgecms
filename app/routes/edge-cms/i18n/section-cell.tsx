import { useFetcher } from 'react-router';
import type { Section } from '~/lib/db.server';

export function SectionCell({
	translationKey,
	currentSection,
	sections,
}: {
	translationKey: string;
	currentSection?: string | null;
	sections: Section[];
}) {
	const fetcher = useFetcher();

	const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newSection = e.target.value || null;
		if (newSection !== currentSection) {
			fetcher.submit(
				{
					intent: 'update-section',
					key: translationKey,
					section: newSection || '',
				},
				{ method: 'post' },
			);
		}
	};

	return (
		<select
			value={currentSection || ''}
			onChange={handleSectionChange}
			className="focus:ring-ring hover:bg-muted/50 w-full cursor-pointer rounded-md border-0 bg-transparent p-1 text-sm focus:ring-1"
			disabled={fetcher.state === 'submitting'}
		>
			<option value="">-</option>
			{sections.map(section => (
				<option key={section.name} value={section.name}>
					{section.name}
				</option>
			))}
		</select>
	);
}
