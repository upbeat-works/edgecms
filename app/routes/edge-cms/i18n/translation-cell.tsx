import { useState, useEffect } from 'react';
import { useFetcher } from 'react-router';
import type { Translation } from '~/lib/db.server';

export function TranslationCell({
	translationKey,
	language,
	translation,
	section,
}: {
	translationKey: string;
	language: string;
	translation?: Translation;
	section?: string | null;
}) {
	const fetcher = useFetcher();
	const [value, setValue] = useState(translation?.value || '');
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setValue(translation?.value || '');
		setIsDirty(false);
	}, [translation?.value]);

	const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		if (isDirty && value !== translation?.value) {
			fetcher.submit(
				{
					intent: 'update-translation',
					key: translationKey,
					language,
					value,
					section: section || '',
				},
				{ method: 'post' },
			);
		}
		const textarea = e.target;
		textarea.style.height = 'auto';
		textarea.rows = 1;
	};

	const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		// Auto-resize on focus
		const textarea = e.target;
		textarea.style.height = 'auto';
		textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const textarea = e.target;
		setValue(textarea.value);
		setIsDirty(true);

		// Auto-resize as user types
		textarea.style.height = 'auto';
		textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
	};

	return (
		<textarea
			value={value}
			onChange={handleInput}
			onFocus={handleFocus}
			onBlur={handleBlur}
			rows={1}
			className="focus:ring-ring focus:bg-background relative min-h-[40px] w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-1 text-sm focus:z-50 focus:ring-1"
			placeholder="Enter translation..."
			style={{ height: '40px' }}
		/>
	);
}
