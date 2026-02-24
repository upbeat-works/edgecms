import { useLoaderData, useFetcher, Link, redirect } from 'react-router';
import { useState } from 'react';
import { camelCase } from 'lodash-es';
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
import { ArrowLeft } from 'lucide-react';
import {
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '~/components/ui/sheet';
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
			name: camelCase(name),
			type,
			refSchemaId: refSchemaId ? parseInt(refSchemaId as string) : undefined,
		});

		return redirect(`/edge-cms/blocks/schemas/${schemaId}`);
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to add property',
		};
	}
}

export default function AddPropertyPage() {
	const { schemaId, schemas } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const [type, setType] = useState<string>('string');

	return (
		<>
			<div className="mb-6 flex items-center gap-3">
				<Link to={`/edge-cms/blocks/schemas/${schemaId}`}>
					<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<SheetHeader className="flex-1 space-y-1">
					<SheetTitle>Add Property</SheetTitle>
					<SheetDescription>Add a new property to the schema</SheetDescription>
				</SheetHeader>
			</div>

			<div className="mt-6">
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
							Will be converted to camelCase
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
								<SelectItem value="number">Number</SelectItem>
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

					<Button type="submit" disabled={fetcher.state === 'submitting'}>
						{fetcher.state === 'submitting' ? 'Adding...' : 'Add Property'}
					</Button>
				</fetcher.Form>
			</div>
		</>
	);
}
