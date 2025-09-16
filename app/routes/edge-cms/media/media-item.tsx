import { useState } from 'react';
import { useFetcher } from 'react-router';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { MediaPreview } from '~/components/media-preview';
import { MarkdownEditor } from '~/components/markdown-editor';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
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

	return (
		<div className="space-y-2 rounded-lg border p-4">
			<div className="flex justify-end">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open media menu"
							className="h-4 w-4 p-0 hover:bg-transparent"
						>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => setShowReplace(true)}>
							Replace with new file
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() =>
								fetcher.submit(
									{
										intent:
											media.state === 'archived' ? 'unarchive' : 'archive',
										mediaId: media.id.toString(),
									},
									{ method: 'post' },
								)
							}
						>
							{media.state === 'archived' ? 'Unarchive' : 'Archive'}
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-red-500"
							onSelect={() => setShowDeleteConfirm(true)}
						>
							Delete
						</DropdownMenuItem>
						{media.count != null && media.count > 1 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onSelect={() => onViewVersions(media.filename)}
								>
									See Versions
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Dialog>
				<DialogTrigger asChild>
					<div className="group border-border relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded border bg-gray-100 transition-colors hover:bg-gray-200">
						<MediaPreview
							version={media.version}
							filename={media.filename}
							mimeType={media.mimeType}
							loading="lazy"
							preload="metadata"
							disableInteraction={true}
						/>
					</div>
				</DialogTrigger>
				<DialogContent
					dismissible={false}
					className="min-w-[90vw] border-0 p-0 outline-none"
				>
					<DialogHeader className="sr-only">
						<DialogTitle>{media.filename}</DialogTitle>
					</DialogHeader>
					{/* Check if file is markdown based on mimeType or file extension */}
					{media.mimeType === 'text/markdown' ||
					media.mimeType === 'text/x-markdown' ||
					media.filename.toLowerCase().endsWith('.md') ||
					media.filename.toLowerCase().endsWith('.markdown') ? (
						<div className="max-h-[90vh] overflow-auto p-6">
							<MarkdownEditor
								filename={media.filename}
								version={media.version}
								mediaId={media.id}
								onSave={() => {
									// Close dialog and refresh page
									window.location.reload();
								}}
							/>
						</div>
					) : (
						<div className="aspect-video">
							<MediaPreview
								filename={media.filename}
								mimeType={media.mimeType}
								className="h-full w-full rounded object-contain"
								showPlayButton={false}
								loading="eager"
							/>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<div className="space-y-1">
				<p className="truncate text-sm font-medium" title={media.filename}>
					{media.filename}
				</p>
				<p className="text-muted-foreground text-xs">
					{(media.sizeBytes / 1024).toFixed(1)} KB • {media.mimeType}
				</p>

				<select
					value={selectedSection}
					onChange={e => handleSectionChange(e.target.value)}
					className="border-input bg-background mt-2 w-full rounded-md border px-3 py-1 text-sm"
				>
					<option value="">No section</option>
					{sections.map(section => (
						<option key={section.name} value={section.name}>
							{section.name}
						</option>
					))}
				</select>
			</div>

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
						<AlertDialogTitle>Delete Media File</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{media.filename}"? This action
							will permanently delete all versions of this file and cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-red-600 hover:bg-red-700"
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
							Delete Permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
