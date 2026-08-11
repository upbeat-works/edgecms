import { useLoaderData, useFetcher, Link, Outlet } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
import { ensureDraftVersion } from '~/utils/ensure-draft-version.server';
import {
	getBlockSchemas,
	getBlockSchemaProperties,
	getBlockCollections,
	getBlockInstances,
	getLanguages,
	getSections,
	deleteBlockCollection,
	updateBlockCollectionSection,
	type BlockSchema,
	type BlockSchemaProperty,
	type BlockCollection,
	type Language,
} from '~/utils/db.server';
import { enrichInstance, type EnrichedInstance } from './block-queries';
import { Button } from '~/components/ui/button';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { EmptyState } from '~/components/ui/empty-state';
import { Badge } from '~/components/ui/badge';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Layers3, MoreHorizontal, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from './components/confirm-dialog';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const [schemas, blocks, languages, sections] = await Promise.all([
		getBlockSchemas(),
		getBlockCollections(),
		getLanguages(),
		getSections(),
	]);

	const schemasWithProperties = await Promise.all(
		schemas.map(async schema => ({
			...schema,
			properties: await getBlockSchemaProperties(schema.id),
		})),
	);

	const blocksWithCounts = await Promise.all(
		blocks.map(async block => {
			const instances = await getBlockInstances(block.id);
			const schema = schemas.find(s => s.id === block.schemaId);

			let instanceData: EnrichedInstance | undefined = undefined;
			if (!block.isCollection && instances.length > 0) {
				const instance = instances[0];
				const properties =
					schemasWithProperties.find(s => s.id === block.schemaId)
						?.properties || [];

				instanceData = await enrichInstance(
					instance,
					properties,
					schema || null,
				);
			}

			return {
				...block,
				schemaName: schema?.name || 'unknown',
				instanceCount: instances.length,
				instance: instanceData,
			};
		}),
	);

	return {
		schemas: schemasWithProperties,
		blocks: blocksWithCounts,
		languages,
		sections,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const auth = await requireAuth(request, env);
	await ensureDraftVersion(auth.user.id);

	const formData = await request.formData();
	const intent = formData.get('intent');

	try {
		switch (intent) {
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

			default:
				return { error: 'Invalid action' };
		}
	} catch (error) {
		return { error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

export default function Blocks() {
	const { schemas, blocks, languages } = useLoaderData<typeof loader>();

	return (
		<div className="flex h-[calc(100vh-64px)]">
			<main className="flex-1 overflow-y-auto">
				<div className="container mx-auto px-4 py-4 lg:py-5">
					<WorkspacePageHeader
						density="compact"
						eyebrow="Content models"
						title="Blocks"
						description="Manage reusable content and the collections that power your site."
						actions={
							<>
								<Button variant="ghost" size="sm" asChild>
									<Link to="/edge-cms/blocks/schemas">
										<Settings2 className="mr-2 h-4 w-4" />
										Schemas
									</Link>
								</Button>
								<Button asChild variant="brand">
									<Link to="/edge-cms/blocks/new">
										<Plus className="mr-2 h-4 w-4" />
										New block
									</Link>
								</Button>
							</>
						}
					/>

					{blocks.length === 0 ? (
						<EmptyState
							title="Build your content model"
							description={
								schemas.length === 0
									? 'Start with a schema, then create a block that uses it.'
									: 'Create a block to start managing reusable content.'
							}
							action={
								<Button asChild variant="brand" size="sm">
									<Link
										to={
											schemas.length === 0
												? '/edge-cms/blocks/schemas/new'
												: '/edge-cms/blocks/new'
										}
									>
										<Plus className="mr-2 h-4 w-4" />
										{schemas.length === 0 ? 'Create schema' : 'Create block'}
									</Link>
								</Button>
							}
							className="bg-white ring-1 ring-black/5"
						/>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{blocks.map(block => (
								<BlockCard
									key={block.id}
									block={block}
									schemas={schemas}
									languages={languages}
								/>
							))}
						</div>
					)}
				</div>
			</main>

			<Outlet />
		</div>
	);
}

function BlockCard({
	block,
	schemas,
	languages,
}: {
	block: BlockCollection & {
		schemaName: string;
		instanceCount: number;
		instance?: EnrichedInstance;
	};
	schemas: (BlockSchema & { properties: BlockSchemaProperty[] })[];
	languages: Language[];
}) {
	const fetcher = useFetcher();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const schema = schemas.find(s => s.id === block.schemaId);
	const defaultLang = languages.find(l => l.default) || languages[0];

	const displayableProperties = schema ? schema.properties : [];

	const getPropertyValue = (prop: BlockSchemaProperty) => {
		if (!block.instance) return <span className="italic">empty</span>;

		switch (prop.type) {
			case 'string':
				return (
					block.instance.values[prop.id]?.stringValue || (
						<span className="italic">empty</span>
					)
				);
			case 'number': {
				const numVal = block.instance.values[prop.id]?.numberValue;
				return numVal != null ? numVal : <span className="italic">empty</span>;
			}
			case 'translation': {
				const value =
					block.instance.translations[prop.name]?.[defaultLang?.locale || ''];
				return value ? (
					<>
						{value}{' '}
						<span className="text-muted-foreground/60">
							({defaultLang?.locale})
						</span>
					</>
				) : (
					<span className="italic">empty</span>
				);
			}
			case 'boolean':
				return block.instance.values[prop.id]?.booleanValue === 1
					? 'true'
					: 'false';
			case 'media': {
				const filename = block.instance.values[prop.id]?.media?.filename;
				return filename || <span className="italic">empty</span>;
			}
			case 'block':
			case 'collection': {
				const refSchema = prop.refSchemaId
					? schemas.find(s => s.id === prop.refSchemaId)
					: null;
				return <span>{refSchema ? refSchema.name : prop.type}</span>;
			}
			default:
				return <span className="text-muted-foreground/60">{prop.type}</span>;
		}
	};

	const navigationPath = block.isCollection
		? `/edge-cms/blocks/${block.id}`
		: block.instance
			? `/edge-cms/blocks/${block.id}/instances/${block.instance.id}`
			: `/edge-cms/blocks/${block.id}`;

	return (
		<div className="group bg-card relative overflow-hidden rounded-xl shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgb(14_165_233/0.12)] hover:ring-sky-500/30 dark:ring-white/10">
			<div
				className={
					block.isCollection
						? 'h-1 bg-gradient-to-r from-sky-400 to-sky-600'
						: 'h-1 bg-gradient-to-r from-fuchsia-400 to-fuchsia-600'
				}
			/>
			<Link
				to={navigationPath}
				className="block min-h-44 p-4 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none focus-visible:ring-inset"
			>
				<div className="mb-4 flex items-start justify-between gap-3 pr-7">
					<div className="min-w-0">
						<h3 className="truncate font-semibold tracking-tight">
							{block.name}
						</h3>
						<p className="text-muted-foreground mt-0.5 truncate text-xs">
							{block.schemaName}
						</p>
					</div>
					<div className="flex items-center gap-2">
						{block.isCollection ? (
							<Badge className="border-0 bg-sky-50 text-[10px] font-semibold tracking-wide text-sky-700 uppercase shadow-none dark:bg-sky-950 dark:text-sky-300">
								Collection
							</Badge>
						) : (
							<Badge className="border-0 bg-fuchsia-50 text-[10px] font-semibold tracking-wide text-fuchsia-700 uppercase shadow-none dark:bg-fuchsia-950 dark:text-fuchsia-300">
								Single
							</Badge>
						)}
					</div>
				</div>
				{block.isCollection ? (
					<div className="flex items-end justify-between pt-5">
						<div>
							<p className="text-3xl font-bold tracking-[-0.04em] tabular-nums">
								{block.instanceCount}
							</p>
							<p className="text-muted-foreground text-xs">
								{block.instanceCount === 1 ? 'item' : 'items'}
							</p>
						</div>
						<Layers3 className="text-muted-foreground/25 h-8 w-8" />
					</div>
				) : (
					<div className="space-y-1.5 text-xs">
						{displayableProperties.slice(0, 3).map(prop => (
							<p key={prop.id} className="flex min-w-0 gap-2">
								<span className="text-muted-foreground w-20 shrink-0 truncate">
									{prop.name}
								</span>
								<span className="min-w-0 truncate font-medium">
									{getPropertyValue(prop)}
								</span>
							</p>
						))}
						{displayableProperties.length > 3 && (
							<p className="text-muted-foreground pt-1 text-[11px]">
								+{displayableProperties.length - 3} more fields
							</p>
						)}
					</div>
				)}
			</Link>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Open menu for ${block.name}`}
						className="absolute top-3.5 right-2 h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
					>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onSelect={() => setShowDeleteConfirm(true)}
						className="text-destructive"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ConfirmDialog
				open={showDeleteConfirm}
				onOpenChange={setShowDeleteConfirm}
				onConfirm={() => {
					fetcher.submit(
						{
							intent: 'delete-block',
							id: block.id.toString(),
						},
						{ method: 'post' },
					);
				}}
				title="Delete block"
				description={`Delete block "${block.name}"? All items and their translations will be deleted.`}
			/>
		</div>
	);
}
