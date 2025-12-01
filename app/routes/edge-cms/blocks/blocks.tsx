import { useLoaderData, useFetcher, useSearchParams, Link } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import {
	Trash2,
	Plus,
	ArrowUp,
	ArrowDown,
	MoreVertical,
	GripVertical,
} from 'lucide-react';
import { requireAuth } from '~/utils/auth.middleware';
// Server-only imports
import {
	getBlockSchemas,
	getBlockSchemaProperties,
	getBlockCollections,
	getBlockInstances,
	getBlockInstanceValues,
	getLanguages,
	getTranslations,
	getSections,
	createBlockSchema,
	deleteBlockSchema,
	createBlockSchemaProperty,
	deleteBlockSchemaProperty,
	createBlockCollection,
	deleteBlockCollection,
	updateBlockCollectionSection,
	createBlockInstance,
	deleteBlockInstance,
	reorderBlockInstances,
	upsertBlockInstanceValue,
	upsertTranslation,
	getBlockCollectionById,
	getBlockSchemaById,
	getLatestMediaVersions,
	getMediaById,
} from '~/utils/db.server';
// Shared imports
import {
	buildTranslationKey,
	type BlockSchema,
	type BlockSchemaProperty,
	type BlockCollection,
	type BlockInstance,
	type Language,
} from '~/utils/blocks';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Badge } from '~/components/ui/badge';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	SheetFooter,
} from '~/components/ui/sheet';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { MediaPreview } from '~/components/media-preview';
import { MediaCard, type MediaCardAction } from '~/components/media-card';
import { MediaPreviewDialog } from '~/components/media-preview-dialog';
import { env } from 'cloudflare:workers';

interface LoaderData {
	schemas: (BlockSchema & { properties: BlockSchemaProperty[] })[];
	blocks: (BlockCollection & {
		schemaName: string;
		instanceCount: number;
	})[];
	languages: Language[];
	sections: { name: string }[];
	media: { id: number; filename: string }[];
	// For block detail view
	selectedBlock?: {
		block: BlockCollection & { schemaName: string };
		instances: (BlockInstance & {
			values: Record<
				number,
				{
					stringValue: string | null;
					booleanValue: number | null;
					mediaId: number | null;
					media: {
						id: number;
						filename: string;
						mimeType: string;
						version: number;
					} | null;
				}
			>;
			translations: Record<string, Record<string, string>>;
		})[];
		properties: BlockSchemaProperty[];
	};
	// For schema detail view
	selectedSchema?: BlockSchema & { properties: BlockSchemaProperty[] };
}

export async function loader({ request }: { request: Request }) {
	await requireAuth(request, env);

	const url = new URL(request.url);
	const blockId = url.searchParams.get('block');
	const schemaId = url.searchParams.get('schema');

	const [schemas, blocks, languages, sections, media] = await Promise.all([
		getBlockSchemas(),
		getBlockCollections(),
		getLanguages(),
		getSections(),
		getLatestMediaVersions(),
	]);

	// Get properties for each schema
	const schemasWithProperties = await Promise.all(
		schemas.map(async schema => ({
			...schema,
			properties: await getBlockSchemaProperties(schema.id),
		})),
	);

	// Get instance counts for each block
	const blocksWithCounts = await Promise.all(
		blocks.map(async block => {
			const instances = await getBlockInstances(block.id);
			const schema = schemas.find(s => s.id === block.schemaId);
			return {
				...block,
				schemaName: schema?.name || 'unknown',
				instanceCount: instances.length,
			};
		}),
	);

	let selectedBlock: LoaderData['selectedBlock'] = undefined;

	if (blockId) {
		const block = await getBlockCollectionById(parseInt(blockId));
		if (block) {
			const instances = await getBlockInstances(block.id);
			const properties = await getBlockSchemaProperties(block.schemaId);
			const schema = await getBlockSchemaById(block.schemaId);

			// Get values and translations for each instance
			const instancesWithData = await Promise.all(
				instances.map(async instance => {
					const values = await getBlockInstanceValues(instance.id);
					const valuesMap: Record<
						number,
						{
							stringValue: string | null;
							booleanValue: number | null;
							mediaId: number | null;
							media: {
								id: number;
								filename: string;
								mimeType: string;
								version: number;
							} | null;
						}
					> = {};

					// Build values map with media info
					await Promise.all(
						values.map(async v => {
							let media = null;
							if (v.mediaId) {
								const mediaFile = await getMediaById(v.mediaId);
								if (mediaFile) {
									media = {
										id: mediaFile.id,
										filename: mediaFile.filename,
										mimeType: mediaFile.mimeType,
										version: mediaFile.version,
									};
								}
							}
							valuesMap[v.propertyId] = {
								stringValue: v.stringValue,
								booleanValue: v.booleanValue,
								mediaId: v.mediaId,
								media,
							};
						}),
					);

					// Get translations for translation-type properties
					const translations: Record<string, Record<string, string>> = {};
					for (const prop of properties) {
						if (prop.type === 'translation' && schema) {
							const key = buildTranslationKey(
								schema.name,
								instance.id,
								prop.name,
							);
							const trans = await getTranslations({ key });
							translations[prop.name] = {};
							trans.forEach(t => {
								translations[prop.name][t.language] = t.value;
							});
						}
					}

					return {
						...instance,
						values: valuesMap,
						translations,
					};
				}),
			);

			selectedBlock = {
				block,
				instances: instancesWithData,
				properties,
			};
		}
	}

	let selectedSchema: LoaderData['selectedSchema'] = undefined;

	if (schemaId) {
		const schema = schemasWithProperties.find(
			s => s.id === parseInt(schemaId),
		);
		if (schema) {
			selectedSchema = schema;
		}
	}

	return {
		schemas: schemasWithProperties,
		blocks: blocksWithCounts,
		languages,
		sections,
		media: media.map(m => ({ id: m.id, filename: m.filename })),
		selectedBlock,
		selectedSchema,
	};
}

export async function action({ request }: { request: Request }) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	try {
		switch (intent) {
			// Schema operations
			case 'create-schema': {
				const name = formData.get('name') as string;
				await createBlockSchema(name.toLowerCase().replace(/\s+/g, '-'));
				return { success: true };
			}

			case 'delete-schema': {
				const id = parseInt(formData.get('id') as string);
				await deleteBlockSchema(id);
				return { success: true };
			}

			// Property operations
			case 'add-property': {
				const schemaId = parseInt(formData.get('schemaId') as string);
				const name = formData.get('name') as string;
				const type = formData.get('type') as BlockSchemaProperty['type'];
				const refSchemaId = formData.get('refSchemaId');
				await createBlockSchemaProperty({
					schemaId,
					name: name.toLowerCase().replace(/\s+/g, '-'),
					type,
					refSchemaId: refSchemaId
						? parseInt(refSchemaId as string)
						: undefined,
				});
				return { success: true };
			}

			case 'delete-property': {
				const id = parseInt(formData.get('id') as string);
				await deleteBlockSchemaProperty(id);
				return { success: true };
			}

			// Block operations
			case 'create-block': {
				const name = formData.get('name') as string;
				const schemaId = parseInt(formData.get('schemaId') as string);
				const section = formData.get('section') as string | null;
				const isCollection = formData.get('isCollection') === 'true';
				await createBlockCollection({
					name: name.toLowerCase().replace(/\s+/g, '-'),
					schemaId,
					section: section && section !== '__auto__' ? section : undefined,
					isCollection,
				});
				return { success: true };
			}

			case 'delete-block': {
				const id = parseInt(formData.get('id') as string);
				await deleteBlockCollection(id);
				return { success: true };
			}

			case 'update-block-section': {
				const id = parseInt(formData.get('id') as string);
				const section = formData.get('section') as string;
				await updateBlockCollectionSection(
					id,
					section && section !== '__none__' ? section : null,
				);
				return { success: true };
			}

			// Instance operations
			case 'create-instance': {
				const blockId = parseInt(formData.get('blockId') as string);
				const schemaId = parseInt(formData.get('schemaId') as string);
				const initialValues = formData.get('initialValues') as string | null;

				const instance = await createBlockInstance({
					schemaId,
					collectionId: blockId,
				});

				// If initial values provided, set them
				if (initialValues) {
					const values = JSON.parse(initialValues);
					const schema = await getBlockSchemaById(schemaId);
					const collection = await getBlockCollectionById(blockId);
					const properties = await getBlockSchemaProperties(schemaId);

					if (schema && collection) {
						// Set string values (non-translatable)
						if (values.strings) {
							for (const [propertyName, value] of Object.entries(
								values.strings,
							)) {
								const prop = properties.find(
									p => p.name === propertyName && p.type === 'string',
								);
								if (prop) {
									await upsertBlockInstanceValue({
										instanceId: instance.id,
										propertyId: prop.id,
										stringValue: value as string,
									});
								}
							}
						}

						// Set translation values (translatable)
						if (values.translations) {
							for (const [propertyName, value] of Object.entries(
								values.translations,
							)) {
								const key = buildTranslationKey(
									schema.name,
									instance.id,
									propertyName,
								);
								await upsertTranslation(
									key,
									values.language,
									value as string,
									collection.section || undefined,
								);
							}
						}

						// Set boolean values
						if (values.booleans) {
							for (const [propertyName, value] of Object.entries(
								values.booleans,
							)) {
								const prop = properties.find(
									p => p.name === propertyName && p.type === 'boolean',
								);
								if (prop) {
									await upsertBlockInstanceValue({
										instanceId: instance.id,
										propertyId: prop.id,
										booleanValue: value as boolean,
									});
								}
							}
						}

						// Set media values
						if (values.media) {
							for (const [propertyName, mediaId] of Object.entries(
								values.media,
							)) {
								const prop = properties.find(
									p => p.name === propertyName && p.type === 'media',
								);
								if (prop && mediaId) {
									await upsertBlockInstanceValue({
										instanceId: instance.id,
										propertyId: prop.id,
										mediaId: parseInt(mediaId as string),
									});
								}
							}
						}
					}
				}

				return { success: true };
			}

			case 'delete-instance': {
				const id = parseInt(formData.get('id') as string);
				await deleteBlockInstance(id);
				return { success: true };
			}

			case 'reorder-instances': {
				const blockId = parseInt(formData.get('blockId') as string);
				const instanceIds = JSON.parse(formData.get('instanceIds') as string);
				await reorderBlockInstances(blockId, instanceIds);
				return { success: true };
			}

			// Value operations
			case 'update-string-value': {
				const instanceId = parseInt(formData.get('instanceId') as string);
				const propertyId = parseInt(formData.get('propertyId') as string);
				const value = formData.get('value') as string;
				await upsertBlockInstanceValue({
					instanceId,
					propertyId,
					stringValue: value,
				});
				return { success: true };
			}

			case 'update-boolean-value': {
				const instanceId = parseInt(formData.get('instanceId') as string);
				const propertyId = parseInt(formData.get('propertyId') as string);
				const value = formData.get('value') === 'true';
				await upsertBlockInstanceValue({
					instanceId,
					propertyId,
					booleanValue: value,
				});
				return { success: true };
			}

			case 'update-media-value': {
				const instanceId = parseInt(formData.get('instanceId') as string);
				const propertyId = parseInt(formData.get('propertyId') as string);
				const mediaId = formData.get('mediaId');
				await upsertBlockInstanceValue({
					instanceId,
					propertyId,
					mediaId: mediaId ? parseInt(mediaId as string) : null,
				});
				return { success: true };
			}

			case 'update-translation': {
				const key = formData.get('key') as string;
				const language = formData.get('language') as string;
				const value = formData.get('value') as string;
				const section = formData.get('section') as string | null;
				await upsertTranslation(key, language, value, section || undefined);
				return { success: true };
			}

			default:
				return { error: 'Invalid action' };
		}
	} catch (error) {
		return { error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

// ==================== Shared UI Components ====================

// Reusable card component for list items
function ItemCard({
	onClick,
	title,
	subtitle,
	preview,
	actions,
}: {
	onClick?: () => void;
	title: string;
	subtitle?: string;
	preview?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	return (
		<div
			onClick={onClick}
			className="group hover:border-primary cursor-pointer rounded-lg border p-4 transition-colors"
		>
			<div className="mb-2 flex items-start justify-between">
				<div>
					<h3 className="font-semibold">{title}</h3>
					{subtitle && (
						<p className="text-muted-foreground text-sm">{subtitle}</p>
					)}
				</div>
				{actions}
			</div>
			{preview && <div className="space-y-1 text-sm">{preview}</div>}
		</div>
	);
}

// ==================== Feature Components ====================

// New Block Sheet
function NewBlockSheet({
	schemas,
	sections,
}: {
	schemas: BlockSchema[];
	sections: { name: string }[];
}) {
	const fetcher = useFetcher();
	const [open, setOpen] = useState(false);
	const [isCollection, setIsCollection] = useState(false);

	useEffect(() => {
		if (fetcher.data?.success) {
			setOpen(false);
		}
	}, [fetcher.data]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" />
					new block
				</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Create Block</SheetTitle>
				</SheetHeader>
				<fetcher.Form method="post" className="mt-6 space-y-6">
					<input type="hidden" name="intent" value="create-block" />
					<input
						type="hidden"
						name="isCollection"
						value={isCollection.toString()}
					/>
					<div className="space-y-2">
						<Label htmlFor="block-name">Block Name</Label>
						<Input
							id="block-name"
							name="name"
							placeholder="e.g., footer, homepage-faqs"
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="block-schema">Schema</Label>
						<Select name="schemaId" required>
							<SelectTrigger>
								<SelectValue placeholder="Select schema..." />
							</SelectTrigger>
							<SelectContent>
								{schemas.map(s => (
									<SelectItem key={s.id} value={s.id.toString()}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center justify-between rounded-lg border p-4">
						<div className="space-y-0.5">
							<Label htmlFor="is-collection">Collection</Label>
							<p className="text-muted-foreground text-xs">
								Multiple items vs single instance
							</p>
						</div>
						<Switch
							id="is-collection"
							checked={isCollection}
							onCheckedChange={(checked: boolean) => setIsCollection(checked)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="block-section">Section (optional)</Label>
						<Select name="section" defaultValue="__auto__">
							<SelectTrigger>
								<SelectValue placeholder="Auto-create from name" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__auto__">Auto-create from name</SelectItem>
								{sections.map(s => (
									<SelectItem key={s.name} value={s.name}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{fetcher.data?.error && (
						<p className="text-destructive text-sm">{fetcher.data.error}</p>
					)}
					<SheetFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={fetcher.state === 'submitting'}>
							{fetcher.state === 'submitting' ? 'Creating...' : 'Create'}
						</Button>
					</SheetFooter>
				</fetcher.Form>
			</SheetContent>
		</Sheet>
	);
}

// Block Card Component
function BlockCard({
	block,
}: {
	block: BlockCollection & { schemaName: string; instanceCount: number };
}) {
	const fetcher = useFetcher();

	return (
		<div className="group hover:border-primary relative rounded-lg border p-4 transition-colors">
			<Link to={`/edge-cms/blocks?block=${block.id}`} className="block">
				<div className="mb-1 flex items-start justify-between">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold">{block.name}</h3>
						{block.isCollection && (
							<Badge variant="secondary" className="text-xs">
								collection
							</Badge>
						)}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild onClick={e => e.preventDefault()}>
							<Button
								variant="ghost"
								size="icon"
								className="opacity-0 group-hover:opacity-100"
							>
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={e => {
									e.preventDefault();
									if (
										confirm(
											`Delete block "${block.name}"? All items and their translations will be deleted.`,
										)
									) {
										fetcher.submit(
											{
												intent: 'delete-block',
												id: block.id.toString(),
											},
											{ method: 'post' },
										);
									}
								}}
								className="text-destructive"
							>
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="space-y-0 text-sm">
					<p className="text-muted-foreground">
						<span className="font-medium">schema:</span> {block.schemaName}
					</p>
					{block.isCollection && (
						<p className="text-muted-foreground">
							<span className="font-medium">items:</span> {block.instanceCount}
						</p>
					)}
				</div>
			</Link>
		</div>
	);
}

// Inline field editors
function InlineTranslationEditor({
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

function StringEditor({
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

function BooleanEditor({
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

function InlineMediaEditor({
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

	const handleArchive = () => {
		if (media?.id) {
			const archiveFetcher = new FormData();
			archiveFetcher.append('intent', 'archive');
			archiveFetcher.append('mediaId', media.id.toString());

			fetch('/edge-cms/media', {
				method: 'POST',
				body: archiveFetcher,
			});
		}
	};

	const handleDelete = () => {
		if (
			media?.id &&
			confirm('Delete all versions of this media? This cannot be undone.')
		) {
			const deleteFetcher = new FormData();
			deleteFetcher.append('intent', 'delete-all-versions');
			deleteFetcher.append('mediaId', media.id.toString());

			fetch('/edge-cms/media', {
				method: 'POST',
				body: deleteFetcher,
			}).then(() => {
				handleRemove();
			});
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
			onClick: handleDelete,
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
		</>
	);
}

// Reusable Block Items View Component
function BlockItemsView({
	block,
	instances,
	properties,
	languages,
	media,
	sections,
	canAddItems = false,
	onAddItem,
	renderItemActions,
}: {
	block: BlockCollection & { schemaName: string };
	instances: (BlockInstance & {
		values: Record<
			number,
			{
				stringValue: string | null;
				booleanValue: number | null;
				mediaId: number | null;
				media: {
					id: number;
					filename: string;
					mimeType: string;
					version: number;
				} | null;
			}
		>;
		translations: Record<string, Record<string, string>>;
	})[];
	properties: BlockSchemaProperty[];
	languages: Language[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	canAddItems?: boolean;
	onAddItem?: () => void;
	renderItemActions?: (
		instance: (typeof instances)[0],
		index: number,
	) => React.ReactNode;
}) {
	const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(
		null,
	);
	const fetcher = useFetcher();

	const stringProps = properties.filter(p => p.type === 'string');
	const translationProps = properties.filter(p => p.type === 'translation');
	const defaultLang = languages.find(l => l.default) || languages[0];

	// Track previous fetcher state for auto-close on item creation
	const prevStateRef = useRef(fetcher.state);
	useEffect(() => {
		if (prevStateRef.current === 'submitting' && fetcher.state === 'idle') {
			if (!fetcher.data?.error && selectedItemIndex === -1) {
				setSelectedItemIndex(null);
			}
		}
		prevStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, selectedItemIndex]);

	// Check if no languages defined
	if (languages.length === 0) {
		return (
			<div className="text-muted-foreground rounded-lg border p-8 text-center">
				<p className="mb-4">
					No languages defined. You need to create at least one language before
					you can edit this block.
				</p>
				<Link to="/edge-cms/i18n">
					<Button>Go to Translations</Button>
				</Link>
			</div>
		);
	}

	const selectedInstance =
		selectedItemIndex !== null && selectedItemIndex !== -1
			? instances[selectedItemIndex]
			: null;
	const isCreatingNew = selectedItemIndex === -1;

	// Detail/Edit view
	if (selectedItemIndex !== null) {
		// Creating new item
		if (isCreatingNew) {
			return (
				<>
					<SheetHeader>
						<div className="flex items-center justify-between">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSelectedItemIndex(null)}
							>
								← Back
							</Button>
						</div>
						<SheetTitle>New Item</SheetTitle>
					</SheetHeader>
					<div className="mt-6">
						<BlockInstanceForm
							block={block}
							instance={null}
							properties={properties}
							languages={languages}
							media={media}
							sections={sections}
							onCancel={() => setSelectedItemIndex(null)}
						/>
					</div>
				</>
			);
		}

		// Editing existing item - use BlockItemEditor
		if (selectedInstance) {
			return (
				<BlockItemEditor
					block={block}
					instance={selectedInstance}
					properties={properties}
					languages={languages}
					media={media}
					sections={sections}
					title={
						canAddItems
							? `Item #${selectedItemIndex + 1}`
							: `Edit ${block.name}`
					}
					subtitle={`id: ${selectedInstance.id}`}
					onCancel={() => setSelectedItemIndex(null)}
					showDeleteButton={true}
					onDelete={() => {
						if (
							confirm(
								'Delete this item? All associated translations will be deleted.',
							)
						) {
							fetcher.submit(
								{
									intent: 'delete-instance',
									id: selectedInstance.id.toString(),
								},
								{ method: 'post' },
							);
							setSelectedItemIndex(null);
						}
					}}
				/>
			);
		}
	}

	// List view
	return (
		<>
			<SheetHeader>
				<SheetTitle>{canAddItems ? 'Items' : 'Content'}</SheetTitle>
			</SheetHeader>
			<div className="mt-6">
				{canAddItems && onAddItem && (
					<div className="mb-4 flex justify-end">
						<Button onClick={() => setSelectedItemIndex(-1)}>
							<Plus className="mr-2 h-4 w-4" />
							Add Item
						</Button>
					</div>
				)}

				{instances.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
						No items yet. Click "Add Item" to create your first{' '}
						{block.schemaName}.
					</div>
				) : (
					<div className="space-y-2">
						{instances.map((instance, index) => (
							<ItemCard
								key={instance.id}
								onClick={() => setSelectedItemIndex(index)}
								title={canAddItems ? `#${index + 1}` : block.name}
								preview={
									<>
										{stringProps.slice(0, 3).map(prop => {
											const value = instance.values[prop.id]?.stringValue || '';
											return (
												<p key={prop.id} className="text-muted-foreground">
													<span className="font-medium">{prop.name}:</span>{' '}
													{value || <span className="italic">empty</span>}
												</p>
											);
										})}
										{translationProps.slice(0, 3).map(prop => {
											const value =
												instance.translations[prop.name]?.[
													defaultLang?.locale || ''
												] || '';
											return (
												<p key={prop.id} className="text-muted-foreground">
													<span className="font-medium">{prop.name}:</span>{' '}
													{value || <span className="italic">empty</span>}
												</p>
											);
										})}
									</>
								}
								actions={renderItemActions?.(instance, index)}
							/>
						))}
					</div>
				)}
			</div>
		</>
	);
}

// Block Item Editor - Reusable component for editing a single block instance
function BlockItemEditor({
	block,
	instance,
	properties,
	languages,
	media,
	sections,
	title,
	subtitle,
	onCancel,
	showDeleteButton = false,
	onDelete,
}: {
	block: BlockCollection & { schemaName: string };
	instance: BlockInstance & {
		values: Record<
			number,
			{
				stringValue: string | null;
				booleanValue: number | null;
				mediaId: number | null;
				media: {
					id: number;
					filename: string;
					mimeType: string;
					version: number;
				} | null;
			}
		>;
		translations: Record<string, Record<string, string>>;
	};
	properties: BlockSchemaProperty[];
	languages: Language[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	title: string;
	subtitle?: string;
	onCancel: () => void;
	showDeleteButton?: boolean;
	onDelete?: () => void;
}) {
	// Check if no languages defined
	if (languages.length === 0) {
		return (
			<div className="text-muted-foreground rounded-lg border p-8 text-center">
				<p className="mb-4">
					No languages defined. You need to create at least one language before
					you can edit this block.
				</p>
				<Link to="/edge-cms/i18n">
					<Button>Go to Translations</Button>
				</Link>
			</div>
		);
	}

	return (
		<>
			<SheetHeader>
				<div className="flex items-center justify-between">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						← Back
					</Button>
					{showDeleteButton && onDelete && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onDelete}
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					)}
				</div>
				<SheetTitle>{title}</SheetTitle>
				{subtitle && (
					<p className="text-muted-foreground text-sm font-normal">
						{subtitle}
					</p>
				)}
			</SheetHeader>
			<div className="mt-6">
				<BlockInstanceForm
					block={block}
					instance={instance}
					properties={properties}
					languages={languages}
					media={media}
					sections={sections}
					onCancel={onCancel}
				/>
			</div>
		</>
	);
}

// Singleton Block Editor (reuses BlockItemEditor)
function SingletonBlockEditor({
	data,
	languages,
	media,
	sections,
	onClose,
}: {
	data: NonNullable<LoaderData['selectedBlock']>;
	languages: Language[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	onClose: () => void;
}) {
	const { block, instances, properties } = data;
	const instance = instances[0];

	if (!instance) {
		return (
			<div className="text-muted-foreground">
				Error: No instance found for singleton block
			</div>
		);
	}

	return (
		<BlockItemEditor
			block={block}
			instance={instance}
			properties={properties}
			languages={languages}
			media={media}
			sections={sections}
			title={`Edit ${block.name}`}
			subtitle={`id: ${instance.id}`}
			onCancel={onClose}
			showDeleteButton={false}
		/>
	);
}

// Block Instance Form Component (unified for creating and editing)
function BlockInstanceForm({
	block,
	instance,
	properties,
	languages,
	media,
	sections,
	onCancel,
}: {
	block: BlockCollection & { schemaName: string };
	instance:
		| (BlockInstance & {
				values: Record<
					number,
					{
						stringValue: string | null;
						booleanValue: number | null;
						mediaId: number | null;
						media: {
							id: number;
							filename: string;
							mimeType: string;
							version: number;
						} | null;
					}
				>;
				translations: Record<string, Record<string, string>>;
		  })
		| null;
	properties: BlockSchemaProperty[];
	languages: Language[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	onCancel: () => void;
}) {
	const fetcher = useFetcher();
	const defaultLang = languages.find(l => l.default) || languages[0];

	const isCreating = instance === null;

	// Initialize form values from existing instance or empty
	const [formValues, setFormValues] = useState<{
		strings: Record<string, string>;
		translations: Record<string, string>;
		booleans: Record<string, boolean>;
		media: Record<string, string>;
	}>(() => {
		if (!instance) {
			return { strings: {}, translations: {}, booleans: {}, media: {} };
		}

		const stringProps = properties.filter(p => p.type === 'string');
		const translationProps = properties.filter(p => p.type === 'translation');
		const booleanProps = properties.filter(p => p.type === 'boolean');
		const mediaProps = properties.filter(p => p.type === 'media');

		return {
			strings: Object.fromEntries(
				stringProps.map(prop => [
					prop.name,
					instance.values[prop.id]?.stringValue || '',
				]),
			),
			translations: Object.fromEntries(
				translationProps.map(prop => [
					prop.name,
					instance.translations[prop.name]?.[defaultLang?.locale || ''] || '',
				]),
			),
			booleans: Object.fromEntries(
				booleanProps.map(prop => [
					prop.name,
					instance.values[prop.id]?.booleanValue === 1,
				]),
			),
			media: Object.fromEntries(
				mediaProps.map(prop => [
					prop.name,
					instance.values[prop.id]?.mediaId?.toString() || '',
				]),
			),
		};
	});

	const stringProps = properties.filter(p => p.type === 'string');
	const translationProps = properties.filter(p => p.type === 'translation');
	const booleanProps = properties.filter(p => p.type === 'boolean');
	const mediaProps = properties.filter(p => p.type === 'media');

	// For editing: use inline editors that save on change
	if (!isCreating && instance) {
		return (
			<div className="space-y-6">
				{/* String properties (non-translatable) */}
				{stringProps.map(prop => (
					<div key={prop.id} className="space-y-2">
						<Label className="text-base font-semibold">{prop.name}</Label>
						<StringEditor
							instanceId={instance.id}
							propertyId={prop.id}
							value={instance.values[prop.id]?.stringValue || null}
							placeholder={`enter ${prop.name}`}
						/>
					</div>
				))}

				{/* Translation properties (translatable) */}
				{translationProps.map(prop => {
					const translationKey = buildTranslationKey(
						block.schemaName,
						instance.id,
						prop.name,
					);
					const defaultValue =
						instance.translations[prop.name]?.[defaultLang?.locale || ''] || '';

					return (
						<div key={prop.id} className="space-y-2">
							<Label className="text-base font-semibold">{prop.name}</Label>
							<Link
								to={`/edge-cms/i18n?query=${encodeURIComponent(translationKey)}`}
								target="_blank"
								className="hover:bg-muted block rounded-lg border p-3 transition-colors"
							>
								<div className="text-sm">
									{defaultValue || (
										<span className="text-muted-foreground italic">
											No translation
										</span>
									)}
								</div>
								<div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
									<span>Edit translations for {prop.name}</span>
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
						</div>
					);
				})}

				{/* Boolean properties */}
				{booleanProps.map(prop => (
					<div
						key={prop.id}
						className="flex items-center justify-between rounded-lg border p-3"
					>
						<Label htmlFor={`bool-${prop.id}`}>{prop.name}</Label>
						<BooleanEditor
							instanceId={instance.id}
							propertyId={prop.id}
							value={instance.values[prop.id]?.booleanValue === 1}
						/>
					</div>
				))}

				{/* Media properties */}
				{mediaProps.map(prop => (
					<div key={prop.id} className="space-y-2">
						<Label>{prop.name}</Label>
						<InlineMediaEditor
							instanceId={instance.id}
							propertyId={prop.id}
							media={instance.values[prop.id]?.media || null}
							section={block.section}
							sections={sections}
						/>
					</div>
				))}
			</div>
		);
	}

	// For creating: use form with submit button
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const hasValues =
			Object.keys(formValues.strings).length > 0 ||
			Object.keys(formValues.translations).length > 0 ||
			Object.keys(formValues.booleans).length > 0 ||
			Object.keys(formValues.media).length > 0;

		const formData: Record<string, string> = {
			intent: 'create-instance',
			blockId: block.id.toString(),
			schemaId: block.schemaId.toString(),
		};

		if (hasValues && defaultLang) {
			formData.initialValues = JSON.stringify({
				...formValues,
				language: defaultLang.locale,
			});
		}

		fetcher.submit(formData, { method: 'post' });
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{/* String properties */}
			{stringProps.map((prop, index) => (
				<div key={prop.id} className="space-y-2">
					<Label htmlFor={`string-${prop.id}`}>{prop.name}</Label>
					<Input
						id={`string-${prop.id}`}
						value={formValues.strings[prop.name] || ''}
						onChange={e =>
							setFormValues(prev => ({
								...prev,
								strings: { ...prev.strings, [prop.name]: e.target.value },
							}))
						}
						placeholder={`Enter ${prop.name}...`}
						autoFocus={index === 0}
					/>
				</div>
			))}

			{/* Translation properties */}
			{translationProps.map((prop, index) => (
				<div key={prop.id} className="space-y-2">
					<Label htmlFor={`translation-${prop.id}`}>
						{prop.name} {defaultLang && `(${defaultLang.locale})`}
					</Label>
					<Input
						id={`translation-${prop.id}`}
						value={formValues.translations[prop.name] || ''}
						onChange={e =>
							setFormValues(prev => ({
								...prev,
								translations: {
									...prev.translations,
									[prop.name]: e.target.value,
								},
							}))
						}
						placeholder={`Enter ${prop.name}...`}
						autoFocus={stringProps.length === 0 && index === 0}
					/>
				</div>
			))}

			{/* Boolean properties */}
			{booleanProps.map(prop => (
				<div
					key={prop.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<Label htmlFor={`boolean-${prop.id}`}>{prop.name}</Label>
					<Switch
						id={`boolean-${prop.id}`}
						checked={formValues.booleans[prop.name] || false}
						onCheckedChange={(checked: boolean) =>
							setFormValues(prev => ({
								...prev,
								booleans: { ...prev.booleans, [prop.name]: checked },
							}))
						}
					/>
				</div>
			))}

			{/* Media properties */}
			{mediaProps.map(prop => (
				<div key={prop.id} className="space-y-2">
					<Label>{prop.name}</Label>
					<Select
						value={formValues.media[prop.name] || undefined}
						onValueChange={(value: string) =>
							setFormValues(prev => ({
								...prev,
								media: {
									...prev.media,
									[prop.name]: value,
								},
							}))
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select media..." />
						</SelectTrigger>
						<SelectContent>
							{media.map(m => (
								<SelectItem key={m.id} value={m.id.toString()}>
									{m.filename}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			))}

			{fetcher.data?.error && (
				<p className="text-destructive text-sm">{fetcher.data.error}</p>
			)}

			<div className="flex gap-2">
				<Button type="submit" disabled={fetcher.state === 'submitting'}>
					{fetcher.state === 'submitting' ? 'Creating...' : 'Create Item'}
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

// Collection Block Editor (shows items list)
function CollectionBlockEditor({
	data,
	languages,
	media,
	sections,
	onClose,
}: {
	data: NonNullable<LoaderData['selectedBlock']>;
	languages: Language[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	onClose: () => void;
}) {
	const fetcher = useFetcher();
	const { block, instances, properties } = data;

	const handleMoveUp = (index: number) => {
		if (index === 0) return;
		const newOrder = [...instances];
		[newOrder[index - 1], newOrder[index]] = [
			newOrder[index],
			newOrder[index - 1],
		];
		fetcher.submit(
			{
				intent: 'reorder-instances',
				blockId: block.id.toString(),
				instanceIds: JSON.stringify(newOrder.map(i => i.id)),
			},
			{ method: 'post' },
		);
	};

	const handleMoveDown = (index: number) => {
		if (index === instances.length - 1) return;
		const newOrder = [...instances];
		[newOrder[index], newOrder[index + 1]] = [
			newOrder[index + 1],
			newOrder[index],
		];
		fetcher.submit(
			{
				intent: 'reorder-instances',
				blockId: block.id.toString(),
				instanceIds: JSON.stringify(newOrder.map(i => i.id)),
			},
			{ method: 'post' },
		);
	};

	return (
		<BlockItemsView
			block={block}
			instances={instances}
			properties={properties}
			languages={languages}
			media={media}
			sections={sections}
			canAddItems={true}
			onAddItem={() => {}}
			renderItemActions={(instance, index) => (
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
					<GripVertical className="text-muted-foreground h-4 w-4" />
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={index === 0}
						onClick={e => {
							e.stopPropagation();
							handleMoveUp(index);
						}}
					>
						<ArrowUp className="h-3 w-3" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={index === instances.length - 1}
						onClick={e => {
							e.stopPropagation();
							handleMoveDown(index);
						}}
					>
						<ArrowDown className="h-3 w-3" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="text-destructive hover:text-destructive h-7 w-7"
						onClick={e => {
							e.stopPropagation();
							if (
								confirm(
									'Delete this item? All associated translations will be deleted.',
								)
							) {
								fetcher.submit(
									{
										intent: 'delete-instance',
										id: instance.id.toString(),
									},
									{ method: 'post' },
								);
							}
						}}
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				</div>
			)}
		/>
	);
}

// Schemas Management Sheet
function ManageSchemasSheet({
	schemas,
}: {
	schemas: (BlockSchema & { properties: BlockSchemaProperty[] })[];
}) {
	const [open, setOpen] = useState(false);
	const [selectedSchemaId, setSelectedSchemaId] = useState<number | null>(null);
	const fetcher = useFetcher();

	// Track previous fetcher state to detect successful submission
	const prevStateRef = useRef(fetcher.state);

	// Auto-close sheet on successful schema creation
	useEffect(() => {
		if (prevStateRef.current === 'submitting' && fetcher.state === 'idle') {
			if (!fetcher.data?.error && selectedSchemaId === -1) {
				// Schema creation was successful, close the sheet
				setOpen(false);
				setSelectedSchemaId(null);
			}
		}
		prevStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, selectedSchemaId]);

	const selectedSchema =
		selectedSchemaId && selectedSchemaId !== -1
			? schemas.find(s => s.id === selectedSchemaId)
			: null;

	return (
		<Sheet
			open={open}
			onOpenChange={isOpen => {
				setOpen(isOpen);
				if (!isOpen) {
					setSelectedSchemaId(null);
				}
			}}
		>
			<SheetTrigger asChild>
				<Button variant="outline" size="sm">
					Manage Schemas
				</Button>
			</SheetTrigger>
			<SheetContent className="overflow-y-auto sm:max-w-xl">
				{selectedSchemaId ? (
					selectedSchemaId === -1 ? (
						<>
							<SheetHeader>
								<div className="flex items-center justify-between">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSelectedSchemaId(null)}
									>
										← Back
									</Button>
								</div>
								<SheetTitle>New Schema</SheetTitle>
							</SheetHeader>
							<div className="mt-6">
								<SchemaDetailView
									schema={null}
									schemas={schemas}
									onDelete={() => setSelectedSchemaId(null)}
								/>
							</div>
						</>
					) : selectedSchema ? (
						<>
							<SheetHeader>
								<div className="flex items-center justify-between">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSelectedSchemaId(null)}
									>
										← Back
									</Button>
								</div>
								<SheetTitle>{selectedSchema.name}</SheetTitle>
							</SheetHeader>
							<div className="mt-6">
								<SchemaDetailView
									schema={selectedSchema}
									schemas={schemas}
									onDelete={() => setSelectedSchemaId(null)}
								/>
							</div>
						</>
					) : null
				) : (
					<>
						<SheetHeader>
							<SheetTitle>Schemas</SheetTitle>
						</SheetHeader>
						<div className="mt-6">
							<div className="mb-4 flex justify-end">
								<Button
									onClick={() => setSelectedSchemaId(-1)}
									className="w-auto"
								>
									<Plus className="mr-2 h-4 w-4" />
									new schema
								</Button>
							</div>
							{schemas.length === 0 ? (
								<div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
									No schemas defined yet. Create a schema to define the
									structure of your blocks.
								</div>
							) : (
								<div className="space-y-2">
									{schemas.map(schema => (
										<div
											key={schema.id}
											onClick={() => setSelectedSchemaId(schema.id)}
										>
											<ItemCard
												title={schema.name}
												subtitle={`${schema.properties.length} properties`}
												preview={
													schema.properties.length > 0 ? (
														<>
															{schema.properties.slice(0, 3).map(prop => (
																<p
																	key={prop.id}
																	className="text-muted-foreground"
																>
																	<span className="font-medium">
																		{prop.name}:
																	</span>{' '}
																	{prop.type}
																	{prop.refSchemaId &&
																		` → ${schemas.find(s => s.id === prop.refSchemaId)?.name}`}
																</p>
															))}
															{schema.properties.length > 3 && (
																<p className="text-muted-foreground text-xs">
																	+{schema.properties.length - 3} more...
																</p>
															)}
														</>
													) : undefined
												}
												actions={
													<Button
														variant="ghost"
														size="icon"
														className="text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
														onClick={e => {
															e.stopPropagation();
															if (
																confirm(
																	`Delete schema "${schema.name}"? This cannot be undone.`,
																)
															) {
																fetcher.submit(
																	{
																		intent: 'delete-schema',
																		id: schema.id.toString(),
																	},
																	{ method: 'post' },
																);
															}
														}}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												}
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

// Schema Detail View Component
function SchemaDetailView({
	schema,
	schemas,
	onDelete,
}: {
	schema: (BlockSchema & { properties: BlockSchemaProperty[] }) | null;
	schemas: BlockSchema[];
	onDelete: () => void;
}) {
	const fetcher = useFetcher();
	const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(
		null,
	);

	const isCreating = schema === null;

	// Track previous fetcher state to detect successful submission
	const prevStateRef = useRef(fetcher.state);

	// Auto-close property form on successful property creation
	useEffect(() => {
		if (prevStateRef.current === 'submitting' && fetcher.state === 'idle') {
			if (!fetcher.data?.error && selectedPropertyId === -1) {
				// Property creation was successful, close the form
				setSelectedPropertyId(null);
			}
		}
		prevStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, selectedPropertyId]);

	// Schema creation form
	if (isCreating) {
		return (
			<fetcher.Form method="post" className="space-y-6">
				<input type="hidden" name="intent" value="create-schema" />
				<div className="space-y-2">
					<Label htmlFor="schema-name">Schema Name</Label>
					<Input
						id="schema-name"
						name="name"
						placeholder="e.g., faq, footer, testimonial"
						required
						autoFocus
					/>
					<p className="text-muted-foreground text-xs">
						Will be converted to lowercase kebab-case
					</p>
				</div>
				{fetcher.data?.error && (
					<p className="text-destructive text-sm">{fetcher.data.error}</p>
				)}
				<Button type="submit" disabled={fetcher.state === 'submitting'}>
					{fetcher.state === 'submitting' ? 'Creating...' : 'Create Schema'}
				</Button>
			</fetcher.Form>
		);
	}

	// Creating new property
	if (selectedPropertyId === -1) {
		return (
			<div className="space-y-6">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setSelectedPropertyId(null)}
				>
					← Back
				</Button>
				<PropertyForm schemaId={schema.id} schemas={schemas} />
			</div>
		);
	}

	// Schema editing view
	return (
		<div className="space-y-6">
			{/* Delete Schema Button */}
			<div className="flex items-center justify-between">
				<div>
					<p className="text-muted-foreground text-sm">
						{schema.properties.length} properties defined
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						if (
							confirm(`Delete schema "${schema.name}"? This cannot be undone.`)
						) {
							fetcher.submit(
								{
									intent: 'delete-schema',
									id: schema.id.toString(),
								},
								{ method: 'post' },
							);
							onDelete();
						}
					}}
					className="text-destructive hover:text-destructive"
				>
					<Trash2 className="mr-2 h-4 w-4" />
					Delete Schema
				</Button>
			</div>

			{/* Add Property Button */}
			<div className="flex justify-end">
				<Button onClick={() => setSelectedPropertyId(-1)} className="w-auto">
					<Plus className="mr-2 h-4 w-4" />
					Add Property
				</Button>
			</div>

			{/* Properties List */}
			{schema.properties.length === 0 ? (
				<div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
					No properties defined yet. Add a property to define the structure.
				</div>
			) : (
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Properties</h4>
					{schema.properties.map(prop => (
						<div
							key={prop.id}
							className="flex items-center justify-between rounded-lg border p-3"
						>
							<div className="flex items-center gap-2">
								<span className="font-medium">{prop.name}</span>
								<span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs">
									{prop.type}
									{prop.refSchemaId &&
										` → ${schemas.find(s => s.id === prop.refSchemaId)?.name}`}
								</span>
							</div>
							<fetcher.Form method="post" className="inline">
								<input type="hidden" name="intent" value="delete-property" />
								<input type="hidden" name="id" value={prop.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									className="text-muted-foreground hover:text-destructive h-8 w-8"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</fetcher.Form>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// Property Form Component
function PropertyForm({
	schemaId,
	schemas,
}: {
	schemaId: number;
	schemas: BlockSchema[];
}) {
	const fetcher = useFetcher();
	const [type, setType] = useState<string>('string');

	return (
		<fetcher.Form method="post" className="space-y-4">
			<input type="hidden" name="intent" value="add-property" />
			<input type="hidden" name="schemaId" value={schemaId} />
			<div className="space-y-2">
				<Label htmlFor="prop-name">Property Name</Label>
				<Input
					id="prop-name"
					name="name"
					placeholder="e.g., title, description, image"
					required
					autoFocus
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="prop-type">Type</Label>
				<Select name="type" value={type} onValueChange={setType}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="string">String</SelectItem>
						<SelectItem value="translation">Translation</SelectItem>
						<SelectItem value="media">Media</SelectItem>
						<SelectItem value="boolean">Boolean</SelectItem>
						<SelectItem value="block">Block (Single)</SelectItem>
						<SelectItem value="collection">Collection (Array)</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{(type === 'block' || type === 'collection') && (
				<div className="space-y-2">
					<Label htmlFor="ref-schema">Reference Schema</Label>
					<Select name="refSchemaId">
						<SelectTrigger>
							<SelectValue placeholder="Select schema..." />
						</SelectTrigger>
						<SelectContent>
							{schemas
								.filter(s => s.id !== schemaId)
								.map(s => (
									<SelectItem key={s.id} value={s.id.toString()}>
										{s.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>
			)}
			{fetcher.data?.error && (
				<p className="text-destructive text-sm">{fetcher.data.error}</p>
			)}
			<Button type="submit" disabled={fetcher.state === 'submitting'}>
				{fetcher.state === 'submitting' ? 'Adding...' : 'Add Property'}
			</Button>
		</fetcher.Form>
	);
}

// Main component
export default function Blocks() {
	const { schemas, blocks, languages, sections, media, selectedBlock } =
		useLoaderData<typeof loader>();
	const [, setSearchParams] = useSearchParams();

	const closeBlockEditor = () => {
		setSearchParams({});
	};

	return (
		<main>
			<div className="container mx-auto py-8">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="text-3xl font-bold">Blocks</h1>
					<div className="flex items-center gap-2">
						<ManageSchemasSheet schemas={schemas} />
						<NewBlockSheet schemas={schemas} sections={sections} />
					</div>
				</div>

				{blocks.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-12 text-center">
						<p className="mb-4">
							No blocks created yet.{' '}
							{schemas.length === 0
								? 'Create a schema first, then create a block.'
								: 'Create a block to get started.'}
						</p>
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{blocks.map(block => (
							<BlockCard key={block.id} block={block} />
						))}
					</div>
				)}
			</div>

			{/* Block Editor Sheet */}
			{selectedBlock && (
				<Sheet open={true} onOpenChange={closeBlockEditor}>
					<SheetContent className="overflow-y-auto sm:max-w-xl">
						{selectedBlock.block.isCollection ? (
							<CollectionBlockEditor
								data={selectedBlock}
								languages={languages}
								media={media}
								sections={sections}
								onClose={closeBlockEditor}
							/>
						) : (
							<SingletonBlockEditor
								data={selectedBlock}
								languages={languages}
								media={media}
								sections={sections}
								onClose={closeBlockEditor}
							/>
						)}
					</SheetContent>
				</Sheet>
			)}
		</main>
	);
}
