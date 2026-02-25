import {
	useLoaderData,
	useFetcher,
	Link,
	Outlet,
	useNavigate,
	useOutlet,
	redirect,
} from 'react-router';
import { useState, useRef } from 'react';
import { requireAuth } from '~/utils/auth.middleware';
import { ensureDraftVersion } from '~/utils/ensure-draft-version.server';
import {
	getBlockCollectionById,
	getBlockInstances,
	getBlockSchemaProperties,
	getBlockSchemaById,
	getLanguages,
	reorderBlockInstances,
	deleteBlockInstance,
	importBlockItems,
} from '~/utils/db.server';
import { enrichInstances } from './block-queries';
import { Button } from '~/components/ui/button';
import {
	Plus,
	ArrowUp,
	ArrowDown,
	Trash2,
	GripVertical,
	Upload,
} from 'lucide-react';
import { ConfirmDialog } from './components/confirm-dialog';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.$id';

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const blockId = parseInt(params.id);

	const [block, languages] = await Promise.all([
		getBlockCollectionById(blockId),
		getLanguages(),
	]);

	if (!block) {
		throw new Response('Block not found', { status: 404 });
	}

	const [instances, properties, schema] = await Promise.all([
		getBlockInstances(blockId),
		getBlockSchemaProperties(block.schemaId),
		getBlockSchemaById(block.schemaId),
	]);

	// Enrich instances with values and translations
	const enrichedInstances = await enrichInstances(
		instances,
		properties,
		schema,
	);

	return {
		block,
		instances: enrichedInstances,
		properties,
		schema,
		languages,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const auth = await requireAuth(request, env);
	await ensureDraftVersion(auth.user.id);

	const blockId = parseInt(params.id);
	const formData = await request.formData();
	const intent = formData.get('intent');

	switch (intent) {
		case 'reorder-instances': {
			const instanceIds = JSON.parse(formData.get('instanceIds') as string);
			await reorderBlockInstances(blockId, instanceIds);
			return { success: true };
		}

		case 'delete-instance': {
			const instanceId = parseInt(formData.get('instanceId') as string);
			await deleteBlockInstance(instanceId);
			return { success: true };
		}

		case 'import-json': {
			const jsonString = formData.get('json') as string;
			const locale = formData.get('locale') as string;
			let items: Record<string, unknown>[];
			try {
				items = JSON.parse(jsonString);
			} catch {
				return { error: 'Invalid JSON' };
			}
			if (!Array.isArray(items)) {
				return { error: 'JSON must be an array' };
			}
			const created = await importBlockItems(blockId, items, locale);
			return { success: true, instancesCreated: created };
		}

		default:
			return { error: 'Invalid action' };
	}
}

export default function BlockDetailPage() {
	const { block, instances, properties, schema, languages } =
		useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const navigate = useNavigate();
	const outlet = useOutlet();
	const defaultLang = languages.find(l => l.default) || languages[0];

	const [deleteInstanceId, setDeleteInstanceId] = useState<number | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const importFetcher = useFetcher();

	const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			importFetcher.submit(
				{
					intent: 'import-json',
					json: reader.result as string,
					locale: defaultLang?.locale || 'en',
				},
				{ method: 'post' },
			);
		};
		reader.readAsText(file);
		// Reset so the same file can be re-selected
		e.target.value = '';
	};

	// Check if we're viewing an instance detail (nested route)
	const isViewingInstance = outlet !== null;

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
				instanceIds: JSON.stringify(newOrder.map(i => i.id)),
			},
			{ method: 'post' },
		);
	};

	const handleDelete = (instanceId: number) => {
		fetcher.submit(
			{
				intent: 'delete-instance',
				instanceId: instanceId.toString(),
			},
			{ method: 'post' },
		);
	};

	const stringProps = properties.filter(p => p.type === 'string');
	const translationProps = properties.filter(p => p.type === 'translation');

	return (
		<>
			<Sheet
				open={true}
				onOpenChange={open =>
					!open && navigate('/edge-cms/blocks', { replace: true })
				}
			>
				<SheetContent side="right" className="w-[600px] overflow-y-auto">
					{isViewingInstance ? (
						// Show instance detail when viewing a specific instance
						<Outlet />
					) : (
						// Show instances list when viewing the block
						<>
							<SheetHeader className="mb-6 space-y-1">
								<SheetTitle>{block.name}</SheetTitle>
								<SheetDescription>
									{schema?.name} collection • {instances.length} items
								</SheetDescription>
							</SheetHeader>

							<div className="mt-6">
								<div className="mb-4 flex gap-2">
									<Link
										to={`/edge-cms/blocks/${block.id}/instances/new`}
										className="flex-1"
									>
										<Button className="w-full">
											<Plus className="mr-2 h-4 w-4" />
											Add Item
										</Button>
									</Link>
									<Button
										variant="outline"
										onClick={() => fileInputRef.current?.click()}
										disabled={importFetcher.state !== 'idle'}
									>
										<Upload className="mr-2 h-4 w-4" />
										{importFetcher.state !== 'idle'
											? 'Importing...'
											: 'Import JSON'}
									</Button>
									<input
										ref={fileInputRef}
										type="file"
										accept=".json"
										className="hidden"
										onChange={handleFileImport}
									/>
								</div>

								{instances.length === 0 ? (
									<div className="text-muted-foreground rounded-lg border p-12 text-center">
										<p className="mb-4">
											No items yet. Click "Add Item" to create your first{' '}
											{schema?.name}.
										</p>
									</div>
								) : (
									<div className="space-y-2">
										{instances.map((instance, index) => (
											<div
												key={instance.id}
												className="group hover:border-primary relative rounded-lg border p-4 transition-colors"
											>
												<Link
													to={`/edge-cms/blocks/${block.id}/instances/${instance.id}`}
													className="block"
												>
													<div className="mb-2 flex items-start justify-between">
														<div>
															<h3 className="font-semibold">
																Item #{index + 1}
															</h3>
															<p className="text-muted-foreground text-xs">
																ID: {instance.id}
															</p>
														</div>
														<div
															className="flex items-center gap-1 opacity-0 group-hover:opacity-100"
															onClick={e => e.preventDefault()}
														>
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
																	e.preventDefault();
																	setDeleteInstanceId(instance.id);
																}}
															>
																<Trash2 className="h-3 w-3" />
															</Button>
														</div>
													</div>

													<div className="space-y-1 text-sm">
														{stringProps.slice(0, 3).map(prop => {
															const value =
																instance.values[prop.id]?.stringValue || '';
															return (
																<p
																	key={prop.id}
																	className="text-muted-foreground truncate"
																>
																	<span className="font-medium">
																		{prop.name}:
																	</span>{' '}
																	{value || (
																		<span className="italic">empty</span>
																	)}
																</p>
															);
														})}
														{translationProps.slice(0, 3).map(prop => {
															const value =
																instance.translations[prop.name]?.[
																	defaultLang?.locale || ''
																] || '';
															return (
																<p
																	key={prop.id}
																	className="text-muted-foreground truncate"
																>
																	<span className="font-medium">
																		{prop.name}:
																	</span>{' '}
																	{value || (
																		<span className="italic">empty</span>
																	)}
																</p>
															);
														})}
													</div>
												</Link>
											</div>
										))}
									</div>
								)}
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
			<ConfirmDialog
				open={deleteInstanceId !== null}
				onOpenChange={open => !open && setDeleteInstanceId(null)}
				onConfirm={() => {
					if (deleteInstanceId !== null) {
						handleDelete(deleteInstanceId);
						setDeleteInstanceId(null);
					}
				}}
				title="Delete item"
				description="Delete this item? All associated translations will be deleted."
			/>
		</>
	);
}
