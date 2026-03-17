import { useLoaderData, useFetcher, Link, redirect } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
import { ensureDraftVersion } from '~/utils/ensure-draft-version.server';
import {
	getBlockSchemaPropertyById,
	updateBlockSchemaProperty,
} from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import {
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas.$id.properties.$propertyId';

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const schemaId = parseInt(params.id);
	const propertyId = parseInt(params.propertyId);
	const property = await getBlockSchemaPropertyById(propertyId);

	if (!property || property.schemaId !== schemaId) {
		throw new Response('Property not found', { status: 404 });
	}

	return { schemaId, property };
}

export async function action({ request, params }: Route.ActionArgs) {
	const auth = await requireAuth(request, env);
	await ensureDraftVersion(auth.user.id);

	const schemaId = parseInt(params.id);
	const propertyId = parseInt(params.propertyId);
	const formData = await request.formData();

	const description = formData.get('description') as string;

	try {
		await updateBlockSchemaProperty(propertyId, {
			description: description || null,
		});

		return redirect(`/edge-cms/blocks/schemas/${schemaId}`);
	} catch (error) {
		return {
			error:
				error instanceof Error
					? error.message
					: 'Failed to update property',
		};
	}
}

export default function EditPropertyPage() {
	const { schemaId, property } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();

	return (
		<>
			<div className="mb-6 flex items-center gap-3">
				<Link to={`/edge-cms/blocks/schemas/${schemaId}`}>
					<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<SheetHeader className="flex-1 space-y-1">
					<SheetTitle>Edit Property</SheetTitle>
					<SheetDescription>{property.name}</SheetDescription>
				</SheetHeader>
			</div>

			<div className="mt-6">
				<fetcher.Form method="post" className="space-y-6">
					<div className="space-y-2">
						<Label>Property Name</Label>
						<Input value={property.name} disabled />
					</div>

					<div className="space-y-2">
						<Label>Type</Label>
						<Input value={property.type} disabled />
					</div>

					<div className="space-y-2">
						<Label htmlFor="prop-description">Description (optional)</Label>
						<Input
							id="prop-description"
							name="description"
							defaultValue={property.description || ''}
							placeholder="Hint shown when editing instances"
							autoFocus
						/>
						<p className="text-muted-foreground text-xs">
							Shown as a hint when editing instances. Supports markdown for
							links.
						</p>
					</div>

					{fetcher.data?.error && (
						<p className="text-destructive text-sm">{fetcher.data.error}</p>
					)}

					<Button type="submit" disabled={fetcher.state === 'submitting'}>
						{fetcher.state === 'submitting' ? 'Saving...' : 'Save'}
					</Button>
				</fetcher.Form>
			</div>
		</>
	);
}
