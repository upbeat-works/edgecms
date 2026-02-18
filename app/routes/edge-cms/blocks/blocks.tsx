import { useLoaderData, useFetcher, Link, Outlet } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
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
import { Badge } from '~/components/ui/badge';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { MoreVertical, Trash2 } from 'lucide-react';
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

	// Get properties for each schema
	const schemasWithProperties = await Promise.all(
		schemas.map(async schema => ({
			...schema,
			properties: await getBlockSchemaProperties(schema.id),
		})),
	);

	// Get instance counts and data for each block
	const blocksWithCounts = await Promise.all(
		blocks.map(async block => {
			const instances = await getBlockInstances(block.id);
			const schema = schemas.find(s => s.id === block.schemaId);

			// For singleton blocks, fetch the instance values
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
	await requireAuth(request, env);

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
			{/* Main content - grid view */}
			<main className="flex-1 overflow-y-auto">
				<div className="container mx-auto py-8">
					<div className="mb-8 flex items-center justify-between">
						<h1 className="text-3xl font-bold">Blocks</h1>
						<div className="flex items-center gap-2">
							<Link to="/edge-cms/blocks/schemas">
								<Button variant="outline" size="sm">
									Manage Schemas
								</Button>
							</Link>
							<Link to="/edge-cms/blocks/new">
								<Button>New Block</Button>
							</Link>
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

			{/* Outlet for nested routes */}
			<Outlet />
		</div>
	);
}

// Block Card Component
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

	// For singleton blocks, get all displayable properties (including nested blocks)
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

	// Determine navigation path based on block type
	const navigationPath = block.isCollection
		? `/edge-cms/blocks/${block.id}`
		: block.instance
			? `/edge-cms/blocks/${block.id}/instances/${block.instance.id}`
			: `/edge-cms/blocks/${block.id}`;

	return (
		<div className="group hover:border-primary relative rounded-lg border p-4 transition-colors">
			<Link to={navigationPath} className="block">
				<div className="mb-1 flex items-start justify-between">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold">{block.name}</h3>
						{block.isCollection ? (
							<Badge variant="secondary" className="text-xs">
								collection
							</Badge>
						) : (
							<Badge variant="outline" className="text-xs">
								{block.schemaName}
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
									setShowDeleteConfirm(true);
								}}
								className="text-destructive"
							>
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				{block.isCollection ? (
					<div className="space-y-0 text-sm">
						<p className="text-muted-foreground">
							<span className="font-medium">schema:</span> {block.schemaName}
						</p>
						<p className="text-muted-foreground">
							<span className="font-medium">items:</span> {block.instanceCount}
						</p>
					</div>
				) : (
					<div className="space-y-0 text-sm">
						{displayableProperties.map(prop => (
							<p key={prop.id} className="text-muted-foreground truncate">
								<span className="font-medium">{prop.name}:</span>{' '}
								{getPropertyValue(prop)}
							</p>
						))}
					</div>
				)}
			</Link>
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
