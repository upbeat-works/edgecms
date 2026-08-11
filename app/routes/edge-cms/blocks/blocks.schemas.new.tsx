import { useEffect } from 'react';
import { useFetcher, Link, useNavigate } from 'react-router';
import { kebabCase, startCase } from 'lodash-es';
import { requireAuth } from '~/utils/auth.middleware';
import { ensureDraftVersion } from '~/utils/ensure-draft-version.server';
import { createBlockSchema } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import {
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from '~/components/ui/sheet';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/blocks.schemas.new';

export async function action({ request }: Route.ActionArgs) {
	const auth = await requireAuth(request, env);
	await ensureDraftVersion(auth.user.id);

	const formData = await request.formData();
	const name = formData.get('name') as string;

	try {
		const schema = await createBlockSchema(kebabCase(startCase(name)));
		return { schemaId: schema.id };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to create schema',
		};
	}
}

export default function NewSchemaPage() {
	const fetcher = useFetcher<typeof action>();
	const navigate = useNavigate();

	useEffect(() => {
		if (fetcher.data && 'schemaId' in fetcher.data) {
			navigate(`/edge-cms/blocks/schemas/${fetcher.data.schemaId}`, {
				replace: true,
			});
		}
	}, [fetcher.data, navigate]);

	return (
		<>
			<div className="mb-6 flex items-center gap-3">
				<Link to="/edge-cms/blocks/schemas">
					<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<SheetHeader className="flex-1 space-y-1">
					<SheetTitle>New schema</SheetTitle>
					<SheetDescription>Define a new block structure</SheetDescription>
				</SheetHeader>
			</div>

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

				<SheetFooter>
					<Link to="/edge-cms/blocks/schemas">
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</Link>
					<Button
						type="submit"
						variant="brand"
						disabled={fetcher.state === 'submitting'}
					>
						{fetcher.state === 'submitting' ? 'Creating...' : 'Create schema'}
					</Button>
				</SheetFooter>
			</fetcher.Form>
		</>
	);
}
