import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export function RenameDialog({
	open,
	onOpenChange,
	mediaId,
	filename,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mediaId: number;
	filename: string;
}) {
	const fetcher = useFetcher<{
		success?: boolean;
		error?: string;
	}>();

	useEffect(() => {
		if (fetcher.data?.success) onOpenChange(false);
	}, [fetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Rename media file</DialogTitle>
					<DialogDescription>
						Every version will keep working at the new filename. Existing public
						URLs using “{filename}” will stop working.
					</DialogDescription>
				</DialogHeader>
				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="rename" />
					<input type="hidden" name="mediaId" value={mediaId} />
					<div className="space-y-2">
						<Label htmlFor={`rename-media-${mediaId}`}>Filename</Label>
						<Input
							id={`rename-media-${mediaId}`}
							name="filename"
							defaultValue={filename}
							required
							autoFocus
						/>
					</div>
					{fetcher.data?.error && (
						<p role="alert" className="text-sm text-red-600">
							{fetcher.data.error}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={fetcher.state === 'submitting'}>
							{fetcher.state === 'submitting' ? 'Renaming...' : 'Rename'}
						</Button>
					</DialogFooter>
				</fetcher.Form>
			</DialogContent>
		</Dialog>
	);
}
