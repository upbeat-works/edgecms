import { useLoaderData, useFetcher, Link, redirect, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getBlockCollectionById,
	getBlockSchemaProperties,
	getBlockSchemaById,
	getLanguages,
	getLatestMediaVersions,
	getSections,
	createBlockInstance,
	upsertBlockInstanceValue,
	upsertTranslation,
	deleteBlockInstance,
} from '~/utils/db.server';
import { buildTranslationKey } from '~/utils/blocks';
import { enrichInstance, type EnrichedInstance } from './block-queries';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { Trash2, ArrowLeft } from 'lucide-react';
import { env } from 'cloudflare:workers';
import {
	StringEditor,
	BooleanEditor,
	InlineMediaEditor,
	TranslationEditorWithLink,
} from './components/inline-editors';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
import type { Route } from './+types/blocks.$id.instances.$action';

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const { id, action } = params;
	const blockId = parseInt(id);

	const [block, languages, media, sections] = await Promise.all([
		getBlockCollectionById(blockId),
		getLanguages(),
		getLatestMediaVersions(),
		getSections(),
	]);

	if (!block) {
		throw new Response('Block not found', { status: 404 });
	}

	const [properties, schema] = await Promise.all([
		getBlockSchemaProperties(block.schemaId),
		getBlockSchemaById(block.schemaId),
	]);

	// Determine mode and load instance if editing
	if (action === 'new') {
		return {
			block,
			properties,
			schema,
			languages,
			media: media.map(m => ({ id: m.id, filename: m.filename })),
			sections,
			instance: null,
			mode: 'create' as const,
		};
	} else {
		// Edit mode - action is the instanceId
		const instanceId = parseInt(action);
		if (isNaN(instanceId)) {
			throw new Response('Invalid instance ID', { status: 400 });
		}

		// Get the instance from the block's instances
		const { getBlockInstances } = await import('~/utils/db.server');
		const instances = await getBlockInstances(blockId);
		const rawInstance = instances.find(i => i.id === instanceId);

		if (!rawInstance) {
			throw new Response('Instance not found', { status: 404 });
		}

		const instance = await enrichInstance(rawInstance, properties, schema);

		return {
			block,
			properties,
			schema,
			languages,
			media: media.map(m => ({ id: m.id, filename: m.filename })),
			sections,
			instance,
			mode: 'edit' as const,
		};
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	await requireAuth(request, env);

	const { id, action } = params;
	const blockId = parseInt(id);
	const formData = await request.formData();
	const intent = formData.get('intent');

	if (action === 'new' && intent === 'create-instance') {
		// Create new instance
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
				// Set string values
				if (values.strings) {
					for (const [propertyName, value] of Object.entries(values.strings)) {
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

				// Set translation values
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
					for (const [propertyName, value] of Object.entries(values.booleans)) {
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
					for (const [propertyName, mediaId] of Object.entries(values.media)) {
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

		// Redirect to edit mode
		return redirect(`/edge-cms/blocks/${blockId}/instances/${instance.id}`);
	} else if (action !== 'new') {
		// Edit mode - action is the instanceId
		const instanceId = parseInt(action);

		if (intent === 'delete-instance') {
			await deleteBlockInstance(instanceId);
			return redirect(`/edge-cms/blocks/${blockId}`);
		}

		// Handle value updates (these come from inline editors in edit mode)
		switch (intent) {
			case 'update-string-value': {
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
		}
	}

	return { error: 'Invalid action' };
}

export default function BlockInstancePage() {
	const { block, properties, schema, languages, media, sections, instance, mode } =
		useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const navigate = useNavigate();
	const defaultLang = languages.find(l => l.default) || languages[0];

	// Check if no languages defined
	if (languages.length === 0) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-muted-foreground rounded-lg border p-8 text-center">
					<p className="mb-4">
						No languages defined. You need to create at least one language
						before you can edit this block.
					</p>
					<Link to="/edge-cms/i18n">
						<Button>Go to Translations</Button>
					</Link>
				</div>
			</div>
		);
	}

	const handleDelete = () => {
		if (
			confirm(
				'Delete this item? All associated translations will be deleted.',
			)
		) {
			fetcher.submit(
				{ intent: 'delete-instance' },
				{ method: 'post' },
			);
		}
	};

	return (
		<>
			<div className="flex items-center gap-3 mb-6">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate(-1)}
					className="h-8 w-8 shrink-0"
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<SheetHeader className="space-y-1 flex-1">
					<SheetTitle>
						{mode === 'create' ? 'New Item' : block.name}
					</SheetTitle>
					<SheetDescription>
						{mode === 'create'
							? `${block.schemaName} • Create new instance`
							: `${block.schemaName} • Instance #${instance?.id}`
						}
					</SheetDescription>
				</SheetHeader>
			</div>

			<div className="mt-6 flex items-center justify-end gap-2 mb-4">
				{mode === 'edit' && (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleDelete}
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				)}
			</div>

			<BlockInstanceForm
				block={block}
				instance={instance}
				properties={properties}
				schema={schema}
				languages={languages}
				media={media}
				sections={sections}
				mode={mode}
				defaultLang={defaultLang}
			/>
		</>
	);
}

// BlockInstanceForm component extracted from original blocks.tsx
function BlockInstanceForm({
	block,
	instance,
	properties,
	schema,
	languages,
	media,
	sections,
	mode,
	defaultLang,
}: {
	block: any;
	instance: EnrichedInstance | null;
	properties: any[];
	schema: any;
	languages: any[];
	media: { id: number; filename: string }[];
	sections: { name: string }[];
	mode: 'create' | 'edit';
	defaultLang: any;
}) {
	const fetcher = useFetcher();

	const stringProps = properties.filter(p => p.type === 'string');
	const translationProps = properties.filter(p => p.type === 'translation');
	const booleanProps = properties.filter(p => p.type === 'boolean');
	const mediaProps = properties.filter(p => p.type === 'media');

	// Initialize form values for create mode
	const [formValues, setFormValues] = useState<{
		strings: Record<string, string>;
		translations: Record<string, string>;
		booleans: Record<string, boolean>;
		media: Record<string, string>;
	}>(() => {
		if (mode === 'edit' && instance) {
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
		}
		return { strings: {}, translations: {}, booleans: {}, media: {} };
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const hasValues =
			Object.keys(formValues.strings).length > 0 ||
			Object.keys(formValues.translations).length > 0 ||
			Object.keys(formValues.booleans).length > 0 ||
			Object.keys(formValues.media).length > 0;

		const formData: Record<string, string> = {
			intent: 'create-instance',
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

	// Create mode - show form with submit button
	if (mode === 'create') {
		return (
			<form onSubmit={handleSubmit} className="space-y-6">
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

				<Button type="submit" disabled={fetcher.state === 'submitting'}>
					{fetcher.state === 'submitting' ? 'Creating...' : 'Create Item'}
				</Button>
			</form>
		);
	}

	// Edit mode - show inline editors that save on change
	return (
		<div className="space-y-6">
			{/* String properties (non-translatable) */}
			{stringProps.map(prop => (
				<div key={prop.id} className="space-y-2">
					<Label>{prop.name}</Label>
					<StringEditor
						instanceId={instance.id}
						propertyId={prop.id}
						value={instance.values[prop.id]?.stringValue || null}
						placeholder={`enter ${prop.name}`}
					/>
				</div>
			))}

			{/* Translation properties (translatable) */}
			{translationProps.map(prop => (
				<div key={prop.id} className="space-y-2">
					<Label>{prop.name}</Label>
					<TranslationEditorWithLink
						schemaName={schema?.name || ''}
						instanceId={instance.id}
						propertyName={prop.name}
						defaultValue={
							instance.translations[prop.name]?.[defaultLang?.locale || ''] || ''
						}
						defaultLanguage={defaultLang?.locale || ''}
						section={block.section}
					/>
				</div>
			))}

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
