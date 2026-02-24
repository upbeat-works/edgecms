import { useState, useEffect } from 'react';
import { useFetcher, Link } from 'react-router';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { MediaCard, type MediaCardAction } from '~/components/media-card';
import { MediaPreviewDialog } from '~/components/media-preview-dialog';


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
 * Inline editor for number-type properties
 * Saves on blur
 */
export function NumberEditor({
	instanceId,
	propertyId,
	value,
	placeholder,
}: {
	instanceId: number;
	propertyId: number;
	value: number | null;
	placeholder?: string;
}) {
	const fetcher = useFetcher();
	const [localValue, setLocalValue] = useState(value?.toString() ?? '');
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setLocalValue(value?.toString() ?? '');
		setIsDirty(false);
	}, [value]);

	const handleBlur = () => {
		const parsed = localValue === '' ? null : Number(localValue);
		const original = value;
		if (isDirty && parsed !== original && (parsed === null || !isNaN(parsed))) {
			fetcher.submit(
				{
					intent: 'update-number-value',
					instanceId: instanceId.toString(),
					propertyId: propertyId.toString(),
					value: parsed != null ? parsed.toString() : '',
				},
				{ method: 'post' },
			);
			setIsDirty(false);
		}
	};

	return (
		<Input
			type="number"
			value={localValue}
			onChange={e => {
				setLocalValue(e.target.value);
				setIsDirty(true);
			}}
			onBlur={handleBlur}
			className="h-9"
			placeholder={placeholder || 'Enter number...'}
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
	availableMedia = [],
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
	availableMedia?: { id: number; filename: string; mimeType: string; version: number }[];
}) {
	const updateFetcher = useFetcher();
	const uploadFetcher = useFetcher();
	const [showReplace, setShowReplace] = useState(false);

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

	const isUploading = uploadFetcher.state === 'submitting';

	const handleSelectExisting = (mediaId: string) => {
		updateFetcher.submit(
			{
				intent: 'update-media-value',
				instanceId: instanceId.toString(),
				propertyId: propertyId.toString(),
				mediaId,
			},
			{ method: 'post' },
		);
		setShowReplace(false);
	};

	const actions: MediaCardAction[] = [
		{
			label: 'Replace',
			onClick: () => setShowReplace(true),
		},
		{
			label: 'Open in Media',
			onClick: () =>
				window.open(
					`/edge-cms/media?filename=${encodeURIComponent(media?.filename || '')}`,
					'_blank',
				),
		},
		{
			label: 'Remove',
			onClick: handleRemove,
			variant: 'destructive' as const,
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
					<div className="space-y-2">
						{availableMedia.length > 0 && (
							<Select onValueChange={handleSelectExisting}>
								<SelectTrigger>
									<SelectValue placeholder="Select existing media..." />
								</SelectTrigger>
								<SelectContent>
									{availableMedia.map(m => (
										<SelectItem key={m.id} value={m.id.toString()}>
											{m.filename}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{availableMedia.length > 0 && (
							<div className="text-muted-foreground flex items-center gap-2 text-xs">
								<div className="bg-border h-px flex-1" />
								<span>or upload new</span>
								<div className="bg-border h-px flex-1" />
							</div>
						)}
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
		</>
	);
}

/**
 * Translation editor with link to full i18n page
 * Shows the default language value and links to edit all translations
 */
export function TranslationEditorWithLink({
	translationKey,
	propertyName,
	defaultValue,
	defaultLanguage,
	section,
}: {
	translationKey: string;
	propertyName: string;
	defaultValue: string;
	defaultLanguage: string;
	section: string | null;
}) {

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
