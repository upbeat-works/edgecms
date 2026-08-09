import { useFetcher } from 'react-router';
import { useEffect, useState } from 'react';
import type { Translation } from '~/utils/db.server';
import { SmartTextarea } from './smart-textarea';
import { toast } from 'sonner';

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
	const fetcher = useFetcher({
		key: `update-translation-${translationKey}-${language}`,
	});
	const [resetKey, setResetKey] = useState(0); // Force reset by changing key

	// Handle fetcher response - reset cell on error
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success === false) {
			setResetKey(prev => prev + 1);
			toast.error(fetcher.data?.error);
		}
	}, [fetcher.state, fetcher.data]);

	const handleSubmit = (value: string) => {
		if (value !== translation?.value) {
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
	};

	const confirmCurrent = () => {
		fetcher.submit(
			{
				intent: 'mark-translation-current',
				key: translationKey,
				language,
			},
			{ method: 'post' },
		);
	};

	const textarea = (
		<SmartTextarea
			key={resetKey} // Force reset when resetKey changes
			value={translation?.value || ''}
			onValueChange={() => {}} // No need to track changes locally
			onSubmit={handleSubmit}
			placeholder="Enter translation..."
			disabled={fetcher.state === 'submitting'}
		/>
	);

	if (!translation?.stale) {
		return textarea;
	}

	return (
		<div className="flex w-full items-start gap-1 rounded-md bg-amber-50 ring-1 ring-amber-300">
			{textarea}
			<button
				type="button"
				onClick={confirmCurrent}
				title="The source text changed after this translation was written. Editing it clears this; use this button to keep it as is."
				aria-label="Keep this translation and clear the outdated marker"
				className="cursor-pointer px-1 py-1 text-amber-600 hover:text-amber-800"
			>
				⚠
			</button>
		</div>
	);
}
