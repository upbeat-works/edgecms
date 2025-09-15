import { useFetcher } from 'react-router';
import { X, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { MediaPreview } from '~/components/media-preview';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
import type { Media } from '~/utils/db.server';

export function VersionsSidebar({
	filename,
	onClose,
	isOpen,
	media,
}: {
	filename: string | null;
	onClose: () => void;
	isOpen: boolean;
	media: Media[];
}) {
	const fetcher = useFetcher();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [versionToDelete, setVersionToDelete] = useState<Media | null>(null);

	if (!isOpen || !filename) return null;

	const handleDeleteClick = (version: Media) => {
		setVersionToDelete(version);
		setDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = () => {
		if (versionToDelete) {
			fetcher.submit(
				{ intent: 'delete-version', mediaId: versionToDelete.id },
				{ method: 'post' },
			);
		}
		setDeleteDialogOpen(false);
		setVersionToDelete(null);
	};

	const versions = media
		.filter(media => media.filename === filename)
		.sort((a, b) => b.version - a.version);

	return (
		<>
			{/* Backdrop */}
			<div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

			{/* Sidebar */}
			<div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l bg-white shadow-xl">
				<div className="flex items-center justify-between border-b p-4">
					<div className="flex items-center gap-2">
						<History className="h-5 w-5" />
						<h2 className="font-semibold">Versions</h2>
					</div>
					<Button variant="ghost" size="icon" onClick={onClose}>
						<X className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto p-4">
					{versions.length === 0 && (
						<div className="text-muted-foreground py-8 text-center">
							No versions found
						</div>
					)}

					{versions.length > 0 && (
						<div className="space-y-4">
							<p className="text-muted-foreground text-sm">
								{filename} ({versions.length} versions)
							</p>

							{versions.map(version => (
								<div
									key={version.id}
									className="space-y-2 rounded-lg border p-3"
								>
									<div className="flex items-start justify-between">
										<div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">
													Version {version.version}
												</span>
												{version.state === 'live' && (
													<span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
														Current
													</span>
												)}
												{version.state === 'archived' && (
													<span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
														Archived
													</span>
												)}
											</div>
											<p className="text-muted-foreground text-xs">
												{version.uploadedAt.toLocaleDateString()} •{' '}
												{(version.sizeBytes / 1024).toFixed(1)} KB
											</p>
										</div>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													aria-label="Open version menu"
													className="h-6 w-6 p-0 hover:bg-gray-100"
												>
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onSelect={() =>
														window.open(
															`/edge-cms/public/media/${version.filename}?version=${version.version}`,
															'_blank',
														)
													}
												>
													View
												</DropdownMenuItem>
												{version.state === 'archived' && (
													<DropdownMenuItem
														onSelect={() =>
															fetcher.submit(
																{ intent: 'unarchive', mediaId: version.id },
																{ method: 'post' },
															)
														}
													>
														Unarchive
													</DropdownMenuItem>
												)}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													onSelect={() => handleDeleteClick(version)}
													className="text-red-600 hover:text-red-700"
												>
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>

									<div className="group border-border relative flex aspect-video items-center justify-center overflow-hidden rounded border bg-gray-100 transition-colors hover:bg-gray-200">
										<MediaPreview
											filename={version.filename}
											mimeType={version.mimeType}
											version={version.version}
											loading="lazy"
											preload="metadata"
											showPlayButton={false}
											disableInteraction={true}
										/>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Version</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete version {versionToDelete?.version}{' '}
							of "{filename}"? This action cannot be undone and will permanently
							remove this version from storage.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setVersionToDelete(null)}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteConfirm}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete Version
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
