import { useFetcher, Link, redirect } from 'react-router';
import { requireAuth } from '~/utils/auth.middleware';
import { createBlockSchema } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas.new';

export async function action({ request }: Route.ActionArgs) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const name = formData.get('name') as string;

	try {
		const schema = await createBlockSchema(
			name.toLowerCase().replace(/\s+/g, '-'),
		);
		return redirect(`/edge-cms/blocks/schemas/${schema.id}`);
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to create schema',
		};
	}
}

export default function NewSchemaPage() {
	const fetcher = useFetcher<typeof action>();

	return (
		<div className="fixed inset-y-0 right-0 w-[500px] border-l bg-background overflow-y-auto">
			<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background p-4">
				<h2 className="text-lg font-semibold">New Schema</h2>
				<Link to="/edge-cms/blocks/schemas">
					<Button variant="ghost" size="sm">
						Close
					</Button>
				</Link>
			</div>

			<div className="p-6">
				<fetcher.Form method="post" className="space-y-6">
					<div className="space-y-2">
						<Label htmlFor="schema-name">Schema Name</Label>
						<Input
							id="schema-name"
							name="name"
							placeholder="e.g., faq, footer, testimonial"
							required
							autoFocus
						/>
						<p className="text-muted-foreground text-xs">
							Will be converted to lowercase kebab-case
						</p>
					</div>

					{fetcher.data?.error && (
						<p className="text-destructive text-sm">{fetcher.data.error}</p>
					)}

					<div className="flex gap-2">
						<Button type="submit" disabled={fetcher.state === 'submitting'}>
							{fetcher.state === 'submitting' ? 'Creating...' : 'Create Schema'}
						</Button>
						<Link to="/edge-cms/blocks/schemas">
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
