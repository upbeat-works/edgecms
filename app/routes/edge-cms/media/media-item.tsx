import { useState } from 'react';
import { useFetcher } from 'react-router';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { MediaCard, type MediaCardAction } from '~/components/media-card';
import { MediaPreviewDialog } from '~/components/media-preview-dialog';
import { UploadDialog } from './upload-dialog';
import type { Media, Section } from '~/utils/db.server';

export function MediaItem({
	media,
	sections,
	onViewVersions,
}: {
	media: Media & { count?: number };
	sections: Section[];
	onViewVersions: (filename: string) => void;
}) {
	const fetcher = useFetcher();
	const [selectedSection, setSelectedSection] = useState(media.section || '');
	const [showReplace, setShowReplace] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const handleSectionChange = (newSection: string) => {
		setSelectedSection(newSection);
		fetcher.submit(
			{
				intent: 'update-section',
				mediaId: media.id.toString(),
				section: newSection,
			},
			{ method: 'post' },
		);
	};

	const actions: MediaCardAction[] = [
		{
			label: 'Replace with new file',
			onClick: () => setShowReplace(true),
		},
		{
			label: media.state === 'archived' ? 'Unarchive' : 'Archive',
			onClick: () =>
				fetcher.submit(
					{
						intent: media.state === 'archived' ? 'unarchive' : 'archive',
						mediaId: media.id.toString(),
					},
					{ method: 'post' },
				),
		},
		{
			label: 'Delete',
			onClick: () => setShowDeleteConfirm(true),
			variant: 'destructive' as const,
		},
		...(media.count != null && media.count > 1
			? [
					{
						label: 'See Versions',
						onClick: () => onViewVersions(media.filename),
						separator: true,
					},
				]
			: []),
	];

	return (
		<>
			<MediaCard
				variant="gallery"
				preview={
					<MediaPreviewDialog
						media={media}
						mediaId={media.id}
						variant="gallery"
					/>
				}
				actions={actions}
				footer={
					<div>
						<p
							className="truncate text-sm font-semibold tracking-tight"
							title={media.filename}
						>
							{media.filename}
						</p>
						<p className="text-muted-foreground mt-0.5 truncate text-[11px] tracking-wide uppercase">
							{media.mimeType.split('/').at(-1)} ·{' '}
							{(media.sizeBytes / 1024).toFixed(1)} KB
						</p>

						<select
							aria-label={`Section for ${media.filename}`}
							value={selectedSection}
							onChange={e => handleSectionChange(e.target.value)}
							className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 -ml-1 max-w-full cursor-pointer rounded-md border-0 bg-transparent py-1 pr-7 pl-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
						>
							<option value="">No section</option>
							{sections.map(section => (
								<option key={section.name} value={section.name}>
									{section.name}
								</option>
							))}
						</select>
					</div>
				}
			/>

			<UploadDialog
				open={showReplace}
				onOpenChange={setShowReplace}
				sections={sections}
				mode="replace"
				mediaId={media.id}
				currentSection={media.section}
			/>

			<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete media file?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{media.filename}"? This action
							will permanently delete all versions of this file and cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								fetcher.submit(
									{
										intent: 'delete-all-versions',
										mediaId: media.id.toString(),
									},
									{ method: 'post' },
								)
							}
						>
							Delete permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
