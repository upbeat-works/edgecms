import { useState, useEffect } from 'react';
import { useFetcher, Link } from 'react-router';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { MediaCard, type MediaCardAction } from '~/components/media-card';
import { MediaPreviewDialog } from '~/components/media-preview-dialog';
import { buildTranslationKey } from '~/utils/blocks';
import { ConfirmDialog } from './confirm-dialog';

/**
 * Inline editor for translation-type properties
 * Saves on blur
 */
export function InlineTranslationEditor({
	translationKey,
	language,
	value,
	section,
	placeholder,
}: {
	translationKey: string;
	language: string;
	value: string;
	section: string | null;
	placeholder?: string;
}) {
	const fetcher = useFetcher();
	const [localValue, setLocalValue] = useState(value);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setLocalValue(value);
		setIsDirty(false);
	}, [value]);

	const handleBlur = () => {
		if (isDirty && localValue !== value) {
			fetcher.submit(
				{
					intent: 'update-translation',
					key: translationKey,
					language,
					value: localValue,
					section: section || '',
				},
				{ method: 'post' },
			);
			setIsDirty(false);
		}
	};

	return (
		<Input
			value={localValue}
			onChange={e => {
				setLocalValue(e.target.value);
				setIsDirty(true);
			}}
			onBlur={handleBlur}
			className="h-9"
			placeholder={placeholder || 'Enter text...'}
		/>
	);
}

/**
 * Inline editor for string-type properties
 * Saves on blur
 */
export function StringEditor({
	instanceId,
	propertyId,
	value,
	placeholder,
}: {
	instanceId: number;
	propertyId: number;
	value: string | null;
	placeholder?: string;
}) {
	const fetcher = useFetcher();
	const [localValue, setLocalValue] = useState(value || '');
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setLocalValue(value || '');
		setIsDirty(false);
	}, [value]);

	const handleBlur = () => {
		if (isDirty && localValue !== (value || '')) {
			fetcher.submit(
				{
					intent: 'update-string-value',
					instanceId: instanceId.toString(),
					propertyId: propertyId.toString(),
					value: localValue,
				},
				{ method: 'post' },
			);
			setIsDirty(false);
		}
	};

	return (
		<Input
			value={localValue}
			onChange={e => {
				setLocalValue(e.target.value);
				setIsDirty(true);
			}}
			onBlur={handleBlur}
			className="h-9"
			placeholder={placeholder || 'Enter text...'}
		/>
	);
}

/**
 * Inline editor for boolean-type properties
 * Saves immediately on change
 */
export function BooleanEditor({
	instanceId,
	propertyId,
	value,
}: {
	instanceId: number;
	propertyId: number;
	value: boolean;
}) {
	const fetcher = useFetcher();

	return (
		<Switch
			checked={value}
			onCheckedChange={(checked: boolean) => {
				fetcher.submit(
					{
						intent: 'update-boolean-value',
						instanceId: instanceId.toString(),
						propertyId: propertyId.toString(),
						value: checked.toString(),
					},
					{ method: 'post' },
				);
			}}
		/>
	);
}

/**
 * Inline editor for media-type properties
 * Handles media upload, preview, archive, and delete
 */
export function InlineMediaEditor({
	instanceId,
	propertyId,
	media,
	section,
	sections,
}: {
	instanceId: number;
	propertyId: number;
	media: {
		id: number;
		filename: string;
		mimeType: string;
		version: number;
	} | null;
	section: string | null;
	sections: { name: string }[];
}) {
	const updateFetcher = useFetcher();
	const uploadFetcher = useFetcher();
	const mediaActionFetcher = useFetcher();
	const [showReplace, setShowReplace] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [pendingDeleteRemove, setPendingDeleteRemove] = useState(false);

	// After successful upload/replace, update the block instance value with the new media ID
	useEffect(() => {
		if (
			uploadFetcher.data?.success &&
			uploadFetcher.data?.id &&
			uploadFetcher.state === 'idle'
		) {
			updateFetcher.submit(
				{
					intent: 'update-media-value',
					instanceId: instanceId.toString(),
					propertyId: propertyId.toString(),
					mediaId: uploadFetcher.data.id.toString(),
				},
				{ method: 'post' },
			);
			setShowReplace(false);
		}
	}, [uploadFetcher.data, uploadFetcher.state, instanceId, propertyId]);

	// After successful media delete, remove the reference from the block instance
	useEffect(() => {
		if (pendingDeleteRemove && mediaActionFetcher.state === 'idle') {
			setPendingDeleteRemove(false);
			handleRemove();
		}
	}, [mediaActionFetcher.state, pendingDeleteRemove]);

	const handleRemove = () => {
		updateFetcher.submit(
			{
				intent: 'update-media-value',
				instanceId: instanceId.toString(),
				propertyId: propertyId.toString(),
				mediaId: '',
			},
			{ method: 'post' },
		);
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('section', section || '');

			uploadFetcher.submit(formData, {
				method: 'post',
				action: '/edge-cms/media/upload?intent=upload',
				encType: 'multipart/form-data',
			});
		}
	};

	const handleArchive = () => {
		if (media?.id) {
			mediaActionFetcher.submit(
				{
					intent: 'archive',
					mediaId: media.id.toString(),
				},
				{ method: 'post', action: '/edge-cms/media' },
			);
		}
	};

	const handleDelete = () => {
		if (media?.id) {
			setPendingDeleteRemove(true);
			mediaActionFetcher.submit(
				{
					intent: 'delete-all-versions',
					mediaId: media.id.toString(),
				},
				{ method: 'post', action: '/edge-cms/media' },
			);
		}
	};

	const isUploading = uploadFetcher.state === 'submitting';

	const actions: MediaCardAction[] = [
		{
			label: 'Replace with new file',
			onClick: () => setShowReplace(true),
		},
		{
			label: 'Archive',
			onClick: handleArchive,
		},
		{
			label: 'Delete',
			onClick: () => setShowDeleteConfirm(true),
			variant: 'destructive' as const,
		},
		{
			label: 'See Versions',
			onClick: () =>
				window.open(
					`/edge-cms/media?filename=${encodeURIComponent(media?.filename || '')}`,
					'_blank',
				),
			separator: true,
		},
	];

	return (
		<>
			<div className="space-y-2">
				{media && !showReplace ? (
					<MediaCard
						preview={<MediaPreviewDialog media={media} mediaId={media.id} />}
						actions={actions}
					/>
				) : (
					<div className="space-y-1">
						<div className="flex gap-2">
							<Input
								type="file"
								onChange={handleFileChange}
								disabled={isUploading}
								className="h-9 flex-1 cursor-pointer"
							/>
							{showReplace && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setShowReplace(false)}
								>
									Cancel
								</Button>
							)}
						</div>
						{isUploading && (
							<p className="text-muted-foreground text-xs">Uploading...</p>
						)}
					</div>
				)}

				{uploadFetcher.data?.error && (
					<p className="text-destructive text-sm">{uploadFetcher.data.error}</p>
				)}
			</div>
			<ConfirmDialog
				open={showDeleteConfirm}
				onOpenChange={setShowDeleteConfirm}
				onConfirm={handleDelete}
				title="Delete media"
				description="Delete all versions of this media? This cannot be undone."
			/>
		</>
	);
}

/**
 * Translation editor with link to full i18n page
 * Shows the default language value and links to edit all translations
 */
export function TranslationEditorWithLink({
	schemaName,
	instanceId,
	propertyName,
	defaultValue,
	defaultLanguage,
	section,
}: {
	schemaName: string;
	instanceId: number;
	propertyName: string;
	defaultValue: string;
	defaultLanguage: string;
	section: string | null;
}) {
	const translationKey = buildTranslationKey(schemaName, instanceId, propertyName);

	if (defaultValue) {
		return (
			<Link
				to={`/edge-cms/i18n?query=${encodeURIComponent(translationKey)}`}
				target="_blank"
				className="hover:bg-muted block rounded-lg border p-3 transition-colors"
			>
				<div className="text-sm">{defaultValue}</div>
				<div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
					<span>Edit translations for {propertyName}</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" x2="21" y1="14" y2="3" />
					</svg>
				</div>
			</Link>
		);
	}

	// No value yet - show inline editor
	return (
		<InlineTranslationEditor
			translationKey={translationKey}
			language={defaultLanguage}
			value=""
			section={section}
			placeholder={`Enter ${propertyName} (${defaultLanguage})...`}
		/>
	);
}
