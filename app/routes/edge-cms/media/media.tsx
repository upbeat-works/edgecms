import { useLoaderData, useSearchParams } from 'react-router';
import { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { requireAuth } from '~/lib/auth.middleware';
import {
	getLatestMediaVersions,
	getMedia,
	getSections,
	markMediaArchived,
	markMediaLive,
	updateMediaSection,
	type Media,
} from '~/lib/db.server';
import { deleteDocument } from '~/lib/media.server';
import { Button } from '~/components/ui/button';
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
