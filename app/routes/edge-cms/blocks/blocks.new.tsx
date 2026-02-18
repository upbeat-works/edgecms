import { useLoaderData, useFetcher, Link, redirect, useNavigate } from 'react-router';
import { useState } from 'react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getBlockSchemas,
	getSections,
	createBlockCollection,
} from '~/utils/db.server';
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
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.new';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const [schemas, sections] = await Promise.all([
		getBlockSchemas(),
		getSections(),
	]);

	return { schemas, sections };
}

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const name = formData.get('name') as string;
	const schemaId = parseInt(formData.get('schemaId') as string);
	const section = formData.get('section') as string | null;
	const isCollection = formData.get('isCollection') === 'true';

	try {
		const block = await createBlockCollection({
			name: name.toLowerCase().replace(/\s+/g, '-'),
			schemaId,
			section: section && section !== '__auto__' ? section : undefined,
			isCollection,
		});

		return redirect(`/edge-cms/blocks/${block.id}`);
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to create block',
		};
	}
}

export default function NewBlockPage() {
	const { schemas, sections } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const navigate = useNavigate();
	const [isCollection, setIsCollection] = useState(false);

	return (
		<Sheet open={true} onOpenChange={open => !open && navigate('/edge-cms/blocks', { replace: true })}>
			<SheetContent side="right" className="w-[500px] overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Create Block</SheetTitle>
				</SheetHeader>

				<div className="mt-6">
				<fetcher.Form method="post" className="space-y-6">
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
							autoFocus
						/>
						<p className="text-muted-foreground text-xs">
							Will be converted to lowercase kebab-case
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="block-schema">Schema</Label>
						<Select name="schemaId" required>
							<SelectTrigger id="block-schema">
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
							onCheckedChange={setIsCollection}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="block-section">Section (optional)</Label>
						<Select name="section" defaultValue="__auto__">
							<SelectTrigger id="block-section">
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

					<div className="flex gap-2">
						<Button type="submit" disabled={fetcher.state === 'submitting'}>
							{fetcher.state === 'submitting' ? 'Creating...' : 'Create Block'}
						</Button>
						<Link to="/edge-cms/blocks">
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</Link>
					</div>
				</fetcher.Form>
				</div>
			</SheetContent>
		</Sheet>
	);
}
