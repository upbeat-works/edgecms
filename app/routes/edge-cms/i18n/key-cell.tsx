import { useFetcher } from 'react-router';
import { useEffect, useState } from 'react';
import { SmartTextarea } from './smart-textarea';
import { toast } from 'sonner';

export function KeyCell({
	translationKey,
}: {
	translationKey: string;
}) {
	const fetcher = useFetcher({ key: `update-key-${translationKey}` });
	const [resetKey, setResetKey] = useState(0); // Force reset by changing key

	// Handle fetcher response - reset cell on error
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success === false) {
			setResetKey(prev => prev + 1);
			toast.error(fetcher.data?.error);
		}
	}, [fetcher.state, fetcher.data]);

	const handleSubmit = (value: string) => {
		const trimmedValue = value.trim();
		if (trimmedValue !== translationKey && trimmedValue !== '') {
			fetcher.submit(
				{
					intent: 'update-key',
					oldKey: translationKey,
					newKey: trimmedValue,
				},
				{ method: 'post' },
			);
		}
	};

	return (
		<SmartTextarea
			key={`${translationKey}-${resetKey}`} // Force reset when resetKey changes
			value={translationKey}
			onValueChange={() => {}} // No need to track changes locally
			onSubmit={handleSubmit}
			placeholder="Enter key..."
			className="font-mono"
			disabled={fetcher.state === 'submitting'}
		/>
	);
}
