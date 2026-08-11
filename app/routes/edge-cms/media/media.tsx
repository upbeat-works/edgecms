import { useLoaderData, useSearchParams } from 'react-router';
import { useState, useMemo } from 'react';
import { Eye, EyeOff, Upload } from 'lucide-react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getLatestMediaVersions,
	getMedia,
	getSections,
	markMediaArchived,
	markMediaLive,
	updateMediaSection,
	type Media,
} from '~/utils/db.server';
import { deleteAllVersions, deleteVersion } from '~/utils/media.server';
import { Button } from '~/components/ui/button';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { EmptyState } from '~/components/ui/empty-state';
import { UploadDialog } from './upload-dialog';
import { MediaItem } from './media-item';
import { VersionsSidebar } from './versions-sidebar';
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
		case 'delete-all-versions': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			await deleteAllVersions(mediaId);
			return { success: true };
		}
		case 'delete-version': {
			const mediaId = parseInt(formData.get('mediaId') as string);
			await deleteVersion(mediaId);
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

export default function MediaManagement() {
	const { media, sections, filenameMedia } = useLoaderData<typeof loader>();
	const [showUpload, setShowUpload] = useState(false);
	const [searchParams, setSearchParams] = useSearchParams();
	const showArchived = searchParams.get('showArchived') === 'true';

	const mediaBySection = useMemo(() => {
		const bySection = new Map<string | null, Media[]>();
		bySection.set(null, []);

		for (const section of sections) {
			bySection.set(section.name, []);
		}

		for (const item of media) {
			if (!showArchived && item.state !== 'live') continue;
			const section = item.section;
			if (!bySection.has(section)) {
				bySection.set(section, []);
			}
			bySection.get(section)!.push(item);
		}

		return bySection;
	}, [media, sections, showArchived]);

	const visibleMediaCount = Array.from(mediaBySection.values()).reduce(
		(total, items) => total + items.length,
		0,
	);

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
			<div className="container mx-auto px-4 py-4 lg:py-5">
				<WorkspacePageHeader
					density="compact"
					eyebrow="Asset library"
					title="Media"
					description="Upload, organise and manage the files used across your content."
					actions={
						<>
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground"
								onClick={() => toggleShowArchived()}
							>
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
							<Button onClick={() => setShowUpload(true)} variant="brand">
								<Upload className="mr-2 h-4 w-4" />
								Upload
							</Button>
						</>
					}
				/>

				<UploadDialog
					open={showUpload}
					onOpenChange={setShowUpload}
					sections={sections}
					mode="upload"
				/>

				{visibleMediaCount === 0 ? (
					<EmptyState
						title={
							showArchived ? 'No archived media' : 'Your media library is ready'
						}
						description={
							showArchived
								? 'Archived files will appear here when you need them.'
								: 'Upload an image, video, or document to use across your content.'
						}
						action={
							<Button
								variant="brand"
								size="sm"
								onClick={() => setShowUpload(true)}
							>
								<Upload className="mr-2 h-4 w-4" />
								Upload media
							</Button>
						}
						className="bg-white ring-1 ring-black/5"
					/>
				) : (
					<div className="space-y-10">
						{Array.from(mediaBySection.entries()).map(
							([sectionName, media]) => {
								if (media.length === 0) return null;

								return (
									<section key={sectionName || 'no-section'}>
										<div className="mb-4 flex items-baseline gap-2">
											<h2 className="text-sm font-semibold tracking-tight">
												{sectionName || 'Unsorted'}
											</h2>
											<span className="text-muted-foreground text-xs tabular-nums">
												{media.length}
											</span>
											<div className="bg-border/70 h-px flex-1" />
										</div>

										<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
											{media.map(item => (
												<MediaItem
													key={item.id}
													media={item}
													sections={sections}
													onViewVersions={handleViewVersions}
												/>
											))}
										</div>
									</section>
								);
							},
						)}
					</div>
				)}
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
