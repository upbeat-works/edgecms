import { useLoaderData, useFetcher, Link, Outlet, useParams, useNavigate } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getBlockSchemas,
	getBlockSchemaById,
	getBlockSchemaProperties,
	deleteBlockSchemaProperty,
} from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas.$id';

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const schemaId = parseInt(params.id);

	const [schema, properties, allSchemas] = await Promise.all([
		getBlockSchemaById(schemaId),
		getBlockSchemaProperties(schemaId),
		getBlockSchemas(),
	]);

	if (!schema) {
		throw new Response('Schema not found', { status: 404 });
	}

	return { schema, properties, allSchemas };
}

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	if (intent === 'delete-property') {
		const id = parseInt(formData.get('id') as string);
		await deleteBlockSchemaProperty(id);
		return { success: true };
	}

	return { error: 'Invalid action' };
}

export default function SchemaDetailPage() {
	const { schema, properties, allSchemas } = useLoaderData<typeof loader>();
	const params = useParams();
	const fetcher = useFetcher();
	const navigate = useNavigate();

	// Check if we're adding a property (nested route is active)
	const isAddingProperty = params.action !== undefined;

	const handleDeleteProperty = (propertyId: number, propertyName: string) => {
		if (
			confirm(`Delete property "${propertyName}"? This cannot be undone.`)
		) {
			fetcher.submit(
				{
					intent: 'delete-property',
					id: propertyId.toString(),
				},
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
					<SheetTitle>{schema.name}</SheetTitle>
					<SheetDescription>
						{properties.length} properties defined
					</SheetDescription>
				</SheetHeader>
			</div>

			<div className="mt-6">
				<div className="flex items-center justify-end mb-4">
					<Link to={`/edge-cms/blocks/schemas/${schema.id}/properties/new`}>
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Property
						</Button>
					</Link>
				</div>

				{properties.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
						No properties defined yet. Add a property to define the structure.
					</div>
				) : (
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Properties</h4>
						{properties.map(prop => (
							<div
								key={prop.id}
								className="flex items-center justify-between rounded-lg border p-3"
							>
								<div className="flex items-center gap-2">
									<span className="font-medium">{prop.name}</span>
									<Badge variant="secondary" className="text-xs">
										{prop.type}
										{prop.refSchemaId &&
											` → ${allSchemas.find(s => s.id === prop.refSchemaId)?.name}`}
									</Badge>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="text-muted-foreground hover:text-destructive h-8 w-8"
									onClick={() => handleDeleteProperty(prop.id, prop.name)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Outlet for nested routes (add property) */}
			{isAddingProperty && <Outlet />}
		</>
	);
}
