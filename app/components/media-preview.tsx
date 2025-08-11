import { FileText, Play } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

interface MediaPreviewProps {
	filename: string;
	mimeType: string;
	version?: number;
	className?: string;
	showPlayButton?: boolean;
	loading?: 'lazy' | 'eager';
	preload?: 'none' | 'metadata' | 'auto';
	disableInteraction?: boolean;
}

export function MediaPreview({
	filename,
	mimeType,
	version,
	className = 'max-w-full max-h-full object-contain',
	showPlayButton = true,
	loading = 'lazy',
	preload = 'metadata',
	disableInteraction = false,
}: MediaPreviewProps) {
	const { ref, inView } = useInView({
		threshold: 0.1,
		triggerOnce: true,
	});

	const mediaUrl = version
		? `/edge-cms/public/media/${filename}?version=${version}`
		: `/edge-cms/public/media/${filename}`;

	if (mimeType.startsWith('image/')) {
		return (
			<img
				src={mediaUrl}
				alt={filename}
				className={className}
				loading={loading}
			/>
		);
	}

	if (mimeType.startsWith('video/')) {
		return (
			<>
				<video
					src={mediaUrl}
					className={className}
					preload={preload}
					controls={!disableInteraction}
				/>
				{showPlayButton && !disableInteraction && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
						<div className="rounded-full bg-white/90 p-3 transition-colors group-hover:bg-white">
							<Play className="h-6 w-6 fill-black text-black" />
						</div>
					</div>
				)}
			</>
		);
	}

	// Document/PDF preview
	return (
		<div ref={ref} className="absolute inset-0 bg-gray-200">
			<div className="absolute inset-0 z-10" />
			{inView && !disableInteraction ? (
				<object
					data={`${mediaUrl}#toolbar=0&navpanes=0&scrollbar=0&scroll=0`}
					type={mimeType}
					aria-label={filename}
					className="h-full w-full object-cover"
					onScroll={e => e.preventDefault()}
				>
					<div className="flex h-full w-full items-center justify-center">
						<FileText className="h-12 w-12 text-gray-400" />
					</div>
				</object>
			) : (
				<div className="flex h-full w-full items-center justify-center">
					<FileText className="h-8 w-8 text-gray-400" />
				</div>
			)}
		</div>
	);
}
