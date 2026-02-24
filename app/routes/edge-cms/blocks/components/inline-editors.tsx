import { useState, useEffect, useRef } from 'react';
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
import { ExternalLink } from 'lucide-react';
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
 * Shows the default language value and links to edit all translations.
 * When no value exists, offers two modes:
 * - "text" (default): enter a new translation value for the default language
 * - "link": link to an existing translation key by name
 */
export function TranslationEditorWithLink({
	translationKey,
	propertyName,
	defaultValue,
	defaultLanguage,
	section,
	instanceId,
	propertyId,
	hasStoredKey,
}: {
	translationKey: string;
	propertyName: string;
	defaultValue: string;
	defaultLanguage: string;
	section: string | null;
	instanceId: number;
	propertyId: number;
	hasStoredKey: boolean;
}) {
	const [mode, setMode] = useState<'text' | 'link'>('text');
	const linkInputRef = useRef<HTMLInputElement>(null);
	const fetcher = useFetcher();
	const [linkValue, setLinkValue] = useState('');

	const handleLinkBlur = () => {
		if (linkValue.trim()) {
			fetcher.submit(
				{
					intent: 'link-translation-key',
					instanceId: instanceId.toString(),
					propertyId: propertyId.toString(),
					translationKey: linkValue.trim(),
				},
				{ method: 'post' },
			);
		}
	};

	const handleUnlink = (e: React.MouseEvent) => {
		e.preventDefault();
		fetcher.submit(
			{
				intent: 'unlink-translation-key',
				instanceId: instanceId.toString(),
				propertyId: propertyId.toString(),
			},
			{ method: 'post' },
		);
	};

	if (defaultValue) {
		return (
			<div className="space-y-2">
				<Link
					to={`/edge-cms/i18n?query=${encodeURIComponent(translationKey)}`}
					target="_blank"
					className="hover:bg-muted block rounded-lg border p-3 transition-colors"
				>
					<div className="text-sm">{defaultValue}</div>
					<div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
						<span>Edit translations for {propertyName}</span>
						<ExternalLink className="h-3 w-3" />
					</div>
				</Link>
				{hasStoredKey && (
					<div className="text-muted-foreground flex items-center justify-between text-xs">
						<span className="font-mono">{translationKey}</span>
						<button
							type="button"
							onClick={handleUnlink}
							className="text-destructive hover:text-destructive/80 underline"
						>
							Unlink key
						</button>
					</div>
				)}
			</div>
		);
	}

	// No value yet - show input with mode toggle
	if (mode === 'link') {
		return (
			<div className="space-y-2">
				<Input
					ref={linkInputRef}
					value={linkValue}
					onChange={e => setLinkValue(e.target.value)}
					onBlur={handleLinkBlur}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault();
							e.currentTarget.blur();
						}
					}}
					className="h-9"
					placeholder="e.g. common.heading"
				/>
				<div className="text-muted-foreground flex items-center justify-between text-xs">
					<span>Use an existing translation key from your i18n data</span>
					<button
						type="button"
						onClick={() => setMode('text')}
						className="hover:text-foreground underline"
					>
						Create new text
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<InlineTranslationEditor
				translationKey={translationKey}
				language={defaultLanguage}
				value=""
				section={section}
				placeholder={`Enter text in ${defaultLanguage}...`}
			/>
			<div className="text-muted-foreground flex items-center justify-between text-xs">
				<span>Creates a new translation key for this property</span>
				<button
					type="button"
					onClick={() => {
						setMode('link');
						setTimeout(() => linkInputRef.current?.focus(), 0);
					}}
					className="hover:text-foreground underline"
				>
					Link to existing key
				</button>
			</div>
		</div>
	);
}
