import { useLoaderData, useFetcher, Link, redirect } from 'react-router';
import { useState } from 'react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getBlockSchemas,
	createBlockSchemaProperty,
	type BlockSchemaProperty,
} from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas.$id.properties.new';

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const schemaId = parseInt(params.id);
	const schemas = await getBlockSchemas();

	return { schemaId, schemas };
}

export async function action({ request, params }: Route.ActionArgs) {
	await requireAuth(request, env);

	const schemaId = parseInt(params.id);
	const formData = await request.formData();

	const name = formData.get('name') as string;
	const type = formData.get('type') as BlockSchemaProperty['type'];
	const refSchemaId = formData.get('refSchemaId');

	try {
		await createBlockSchemaProperty({
			schemaId,
			name: name.toLowerCase().replace(/\s+/g, '-'),
			type,
			refSchemaId: refSchemaId ? parseInt(refSchemaId as string) : undefined,
		});

		return redirect(`/edge-cms/blocks/schemas/${schemaId}`);
	} catch (error) {
		return {
			error:
				error instanceof Error ? error.message : 'Failed to add property',
		};
	}
}

export default function AddPropertyPage() {
	const { schemaId, schemas } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const [type, setType] = useState<string>('string');

	return (
		<div className="fixed inset-y-0 right-0 w-[500px] border-l bg-background overflow-y-auto">
			<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background p-4">
				<h2 className="text-lg font-semibold">Add Property</h2>
				<Link to={`/edge-cms/blocks/schemas/${schemaId}`}>
					<Button variant="ghost" size="sm">
						Close
					</Button>
				</Link>
			</div>

			<div className="p-6">
				<fetcher.Form method="post" className="space-y-6">
					<div className="space-y-2">
						<Label htmlFor="prop-name">Property Name</Label>
						<Input
							id="prop-name"
							name="name"
							placeholder="e.g., title, description, image"
							required
							autoFocus
						/>
						<p className="text-muted-foreground text-xs">
							Will be converted to lowercase kebab-case
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="prop-type">Type</Label>
						<Select name="type" value={type} onValueChange={setType}>
							<SelectTrigger id="prop-type">
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
								<SelectTrigger id="ref-schema">
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

					<div className="flex gap-2">
						<Button type="submit" disabled={fetcher.state === 'submitting'}>
							{fetcher.state === 'submitting' ? 'Adding...' : 'Add Property'}
						</Button>
						<Link to={`/edge-cms/blocks/schemas/${schemaId}`}>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</Link>
					</div>
				</fetcher.Form>
			</div>
		</div>
	);
}
