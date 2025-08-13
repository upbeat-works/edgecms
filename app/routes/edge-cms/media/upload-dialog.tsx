import { useState, useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog';
import type { Section } from '~/lib/db.server';

export function UploadDialog({
	open,
	onOpenChange,
	sections,
	mode = 'upload',
	mediaId,
	currentSection,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sections: Section[];
	mode?: 'upload' | 'replace';
	mediaId?: number;
	currentSection?: string | null;
}) {
	const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
	const uploadFetcher = useFetcher();
	const [error, setError] = useState<string | null>(null);

	// Close dialog on successful upload/replace
	useEffect(() => {
		if (uploadFetcher.data?.success && uploadFetcher.state === 'idle') {
			onOpenChange(false);
			setSelectedFiles(null);
		}
		if (uploadFetcher.data?.error) {
			setError(uploadFetcher.data.error);
		}
	}, [uploadFetcher.data, uploadFetcher.state, onOpenChange]);

	const isReplacing = mode === 'replace';
	const title = isReplacing ? 'Replace Media' : 'Upload Media';
	const submitText = isReplacing ? 'Replace' : 'Upload';
	const loadingText = isReplacing ? 'Replacing...' : 'Uploading...';

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				{error && <p className="text-red-500">{error}</p>}
				<uploadFetcher.Form
					method="post"
					encType="multipart/form-data"
					className="space-y-4"
					action={`/edge-cms/media/upload?intent=${isReplacing ? 'replace' : 'upload'}${isReplacing ? `&mediaId=${mediaId}` : ''}`}
				>
					<div>
						<Label htmlFor="section">
							Section {isReplacing ? '' : '(optional)'}
						</Label>
						<select
							id="section"
							name="section"
							disabled={isReplacing}
							defaultValue={isReplacing ? currentSection || '' : ''}
							className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">No section</option>
							{sections.map(section => (
								<option key={section.name} value={section.name}>
									{section.name}
								</option>
							))}
						</select>
					</div>

					<div>
						<Label htmlFor="file">Select File</Label>
						<Input
							id="file"
							name="file"
							type="file"
							multiple={false}
							required
							onChange={e => setSelectedFiles(e.target.files)}
							className="cursor-pointer"
						/>
						{selectedFiles && (
							<p className="text-muted-foreground mt-1 text-sm">
								{selectedFiles.length} file(s) selected
							</p>
						)}
					</div>

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								onOpenChange(false);
								setSelectedFiles(null);
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={uploadFetcher.state === 'submitting'}
						>
							{uploadFetcher.state === 'submitting' ? loadingText : submitText}
						</Button>
					</div>
				</uploadFetcher.Form>
			</DialogContent>
		</Dialog>
	);
}
