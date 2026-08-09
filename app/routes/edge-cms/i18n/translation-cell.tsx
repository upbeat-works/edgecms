import { useFetcher } from 'react-router';
import { useEffect, useState } from 'react';
import type { Translation } from '~/utils/db.server';
import { SmartTextarea } from './smart-textarea';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip';

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
	const [resetKey, setResetKey] = useState(0);

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
			key={resetKey}
			value={translation?.value || ''}
			onValueChange={() => {}}
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
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={confirmCurrent}
						disabled={fetcher.state === 'submitting'}
						aria-label="Keep this translation and mark it current"
						className="cursor-pointer rounded-sm p-1 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-600 disabled:cursor-wait disabled:opacity-50"
					>
						<RefreshCw className="size-4" aria-hidden="true" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={6} className="max-w-64">
					The source text changed. Review this translation, or click to keep it
					unchanged and mark it current.
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
