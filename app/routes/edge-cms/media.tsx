import { useLoaderData, useFetcher, useSearchParams } from 'react-router';
import { useState, useEffect, useMemo } from 'react';

import { X, History, Eye, EyeOff } from 'lucide-react';
import { requireAuth } from '~/lib/auth.middleware';
import {
	getLatestMediaVersions,
	getMedia,
	getSections,
	markMediaArchived,
	markMediaLive,
	updateMediaSection,
	type Media,
	type Section,
} from '~/lib/db.server';
import { deleteDocument } from '~/lib/media.server';
import { Button } from '~/components/ui/button';
import { MediaPreview } from '~/components/media-preview';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/media';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);
	const url = new URL(request.url);
	const filename = url.searchParams.get('filename');

	const [media, sections, filenameMedia] = await Promise.all([
		getLatestMediaVersions(),
		getSections(),
		filename ? getMedia({ filename }) : Promise.resolve([]),
	]);

	return { media, sections, filenameMedia };
}

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	switch (intent) {
		case 'delete': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			await deleteDocument(mediaId);
			return { success: true };
		}
		case 'archive': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			await markMediaArchived(mediaId);
			return { success: true };
		}
		case 'unarchive': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			await markMediaLive(mediaId);
			return { success: true };
		}

		case 'update-section': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			const section = formData.get('section') as string | null;

			await updateMediaSection(mediaId, section === '' ? null : section);
			return { success: true };
		}

		default:
			return { error: 'Invalid action' };
	}
}

// Reusable upload dialog component
function UploadDialog({
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
					action={`/edge-cms/media-upload?intent=${isReplacing ? 'replace' : 'upload'}${isReplacing ? `&mediaId=${mediaId}` : ''}`}
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

function MediaItem({
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
							onSelect={() =>
								fetcher.submit(
									{ intent: 'delete', mediaId: media.id.toString() },
									{ method: 'post' },
								)
							}
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
					<div className="group relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded bg-gray-100 transition-colors hover:bg-gray-200">
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
					<div className="aspect-video">
						<MediaPreview
							filename={media.filename}
							mimeType={media.mimeType}
							className="h-full w-full rounded object-contain"
							showPlayButton={false}
							loading="eager"
						/>
					</div>
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
		</div>
	);
}

// Versions sidebar component
function VersionsSidebar({
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
	if (!isOpen || !filename) return null;

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
									</div>

									<div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-gray-100">
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

									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												window.open(
													`/edge-cms/public/media/${version.filename}?version=${version.version}`,
													'_blank',
												)
											}
										>
											View
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												fetcher.submit(
													{ intent: 'unarchive', mediaId: version.id },
													{ method: 'post' },
												)
											}
										>
											Unarchive
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</>
	);
}

export default function MediaManagement() {
	const { media, sections, filenameMedia } = useLoaderData<typeof loader>();
	const [showUpload, setShowUpload] = useState(false);
	const [searchParams, setSearchParams] = useSearchParams();

	const mediaBySection = useMemo(() => {
		// Group live media by section for main display
		const bySection = new Map<string | null, Media[]>();
		bySection.set(null, []); // No section group

		for (const section of sections) {
			bySection.set(section.name, []);
		}

		for (const item of media) {
			const section = item.section;
			if (!bySection.has(section)) {
				bySection.set(section, []);
			}
			bySection.get(section)!.push(item);
		}

		return bySection;
	}, [media, sections]);

	const handleViewVersions = (filename: string) => {
		setSearchParams(prev => {
			prev.set('filename', filename);
			return prev;
		});
	};

	const handleCloseSidebar = () => {
		setSearchParams(prev => {
			prev.delete('filename');
			return prev;
		});
	};
	const toggleShowArchived = () => {
		setSearchParams(prev => {
			if (prev.get('showArchived') === 'true') {
				prev.delete('showArchived');
			} else {
				prev.set('showArchived', 'true');
			}
			return prev;
		});
	};

	const selectedFilename = searchParams.get('filename');

	return (
		<main>
			<div className="container mx-auto py-8">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="text-3xl font-bold">Media Management</h1>
					<div className="flex items-center gap-2">
						<Button variant="ghost" onClick={() => toggleShowArchived()}>
							{searchParams.get('showArchived') === 'true' ? (
								<>
									<EyeOff className="mr-2 h-4 w-4" />
									Hide Archived
								</>
							) : (
								<>
									<Eye className="mr-2 h-4 w-4" />
									Show Archived
								</>
							)}
						</Button>
						<Button onClick={() => setShowUpload(true)}>Upload Media</Button>
					</div>
				</div>

				<UploadDialog
					open={showUpload}
					onOpenChange={setShowUpload}
					sections={sections}
					mode="upload"
				/>

				{/* Media Grid by Section */}
				<div className="space-y-8">
					{Array.from(mediaBySection.entries()).map(([sectionName, media]) => {
						if (media.length === 0) return null;

						return (
							<div key={sectionName || 'no-section'}>
								<h2 className="mb-4 text-xl font-semibold">
									{sectionName || 'No Section'}
									<span className="text-muted-foreground ml-2 text-sm">
										({media.length} items)
									</span>
								</h2>

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
									{media
										.filter(item => {
											if (searchParams.get('showArchived') === 'true') {
												return true;
											}
											return item.state === 'live';
										})
										.map(item => (
											<MediaItem
												key={item.id}
												media={item}
												sections={sections}
												onViewVersions={handleViewVersions}
											/>
										))}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<VersionsSidebar
				filename={selectedFilename}
				onClose={handleCloseSidebar}
				isOpen={!!selectedFilename}
				media={filenameMedia}
			/>
		</main>
	);
}
