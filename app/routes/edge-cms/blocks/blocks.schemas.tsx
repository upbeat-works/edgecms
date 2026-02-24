import {
	useLoaderData,
	useFetcher,
	Link,
	Outlet,
	useNavigate,
	useOutlet,
} from 'react-router';
import { useState } from 'react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getBlockSchemas,
	getBlockSchemaProperties,
	deleteBlockSchema,
} from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from './components/confirm-dialog';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const schemas = await getBlockSchemas();

	// Get properties for each schema
	const schemasWithProperties = await Promise.all(
		schemas.map(async schema => ({
			...schema,
			properties: await getBlockSchemaProperties(schema.id),
		})),
	);

	return { schemas: schemasWithProperties };
}

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	if (intent === 'delete-schema') {
		const id = parseInt(formData.get('id') as string);
		await deleteBlockSchema(id);
		return { success: true };
	}

	return { error: 'Invalid action' };
}

export default function SchemasPage() {
	const { schemas } = useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const navigate = useNavigate();
	const outlet = useOutlet();

	// Check if we're viewing a specific schema or creating a new one (nested route is active)
	const isViewingSchema = outlet !== null;
	const [deleteSchema, setDeleteSchema] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const handleDelete = (schemaId: number) => {
		fetcher.submit(
			{
				intent: 'delete-schema',
				id: schemaId.toString(),
			},
			{ method: 'post' },
		);
	};

	return (
		<>
			<Sheet
				open={true}
				onOpenChange={open =>
					!open && navigate('/edge-cms/blocks', { replace: true })
				}
			>
				<SheetContent side="right" className="w-[800px] overflow-y-auto">
					{isViewingSchema ? (
						// Show schema detail when viewing a specific schema
						<Outlet />
					) : (
						// Show schemas list
						<>
							<SheetHeader className="mb-6 space-y-1">
								<SheetTitle>Schemas</SheetTitle>
								<SheetDescription>
									Define the structure of your blocks
								</SheetDescription>
							</SheetHeader>

							<div className="mt-6">
								<div className="mb-6 flex items-center justify-end">
									<Link to="/edge-cms/blocks/schemas/new">
										<Button>
											<Plus className="mr-2 h-4 w-4" />
											New Schema
										</Button>
									</Link>
								</div>

								{schemas.length === 0 ? (
									<div className="text-muted-foreground rounded-lg border p-12 text-center">
										<p className="mb-4">
											No schemas defined yet. Create a schema to define the
											structure of your blocks.
										</p>
									</div>
								) : (
									<div className="space-y-2">
										{schemas.map(schema => (
											<div
												key={schema.id}
												className="group hover:border-primary relative rounded-lg border p-4 transition-colors"
											>
												<Link
													to={`/edge-cms/blocks/schemas/${schema.id}`}
													className="block"
												>
													<div className="mb-2 flex items-start justify-between">
														<div>
															<h3 className="font-semibold">{schema.name}</h3>
															<p className="text-muted-foreground text-sm">
																{schema.properties.length} properties
															</p>
														</div>
														<div
															className="opacity-0 group-hover:opacity-100"
															onClick={e => {
																e.preventDefault();
																e.stopPropagation();
															}}
														>
															<Button
																variant="ghost"
																size="icon"
																className="text-destructive hover:text-destructive h-7 w-7"
																onClick={() =>
																	setDeleteSchema({
																		id: schema.id,
																		name: schema.name,
																	})
																}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													</div>

													{schema.properties.length > 0 && (
														<div className="space-y-1 text-sm">
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
														</div>
													)}
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
				open={deleteSchema !== null}
				onOpenChange={open => !open && setDeleteSchema(null)}
				onConfirm={() => {
					if (deleteSchema !== null) {
						handleDelete(deleteSchema.id);
						setDeleteSchema(null);
					}
				}}
				title="Delete schema"
				description={`Delete schema "${deleteSchema?.name}"? This cannot be undone.`}
			/>
		</>
	);
}
