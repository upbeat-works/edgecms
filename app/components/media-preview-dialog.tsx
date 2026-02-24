import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { MediaPreview } from '~/components/media-preview';
import { MarkdownEditor } from '~/components/markdown-editor';

interface MediaPreviewDialogProps {
	media: {
		filename: string;
		mimeType: string;
		version?: number;
	};
	mediaId?: number;
}

export function MediaPreviewDialog({
	media,
	mediaId,
}: MediaPreviewDialogProps) {
	return (
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
				{(media.mimeType === 'text/markdown' ||
					media.mimeType === 'text/x-markdown' ||
					media.filename.toLowerCase().endsWith('.md') ||
					media.filename.toLowerCase().endsWith('.markdown')) &&
				mediaId ? (
					<div className="max-h-[90vh] overflow-auto p-6">
						<MarkdownEditor
							filename={media.filename}
							version={media.version}
							mediaId={mediaId}
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
							version={media.version}
							className="h-full w-full rounded object-contain"
							showPlayButton={false}
							loading="eager"
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
