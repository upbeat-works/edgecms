import { env } from 'cloudflare:workers';
import { ArrowLeft } from 'lucide-react';
import { Link, redirect, useFetcher } from 'react-router';
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
import { requireAuth } from '~/utils/auth.middleware';
import type { LegalDocumentType } from '~/utils/db.server';
import { createLegalDocument } from '~/utils/services/legal.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/legal.new';

const documentTypes: Array<{ value: LegalDocumentType; label: string }> = [
	{ value: 'terms_and_conditions', label: 'Terms and conditions' },
	{ value: 'privacy_policy', label: 'Privacy policy' },
	{ value: 'cookie_policy', label: 'Cookie policy' },
	{ value: 'dpa', label: 'Data processing agreement' },
	{ value: 'other', label: 'Other agreement' },
];

export async function action({ request }: Route.ActionArgs) {
	const { user } = await requireAuth(request, env);
	const formData = await request.formData();
	const result = await createLegalDocument({
		name: String(formData.get('name') ?? ''),
		slug: String(formData.get('slug') ?? ''),
		type: String(formData.get('type') ?? '') as LegalDocumentType,
		userId: user.id,
	});
	if (!result.ok) return toResponse(result);
	return redirect(`/edge-cms/legal/${result.data.id}`);
}

export default function NewLegalDocumentPage() {
	const fetcher = useFetcher<{ error?: string }>();
	const error = fetcher.data?.error ?? null;

	return (
		<div className="container mx-auto max-w-2xl py-10">
			<Link
				to="/edge-cms/legal"
				className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
			>
				<ArrowLeft className="h-4 w-4" />
				Legal documents
			</Link>
			<div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-sky-100/50 sm:p-9">
				<div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-fuchsia-500" />
				<p className="text-xs font-semibold tracking-[0.18em] text-sky-600 uppercase">
					New legal record
				</p>
				<h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
					Create a document
				</h1>
				<p className="mt-2 text-sm text-slate-500">
					This record groups localized drafts and every immutable release.
				</p>

				<fetcher.Form method="post" className="mt-8 space-y-6">
					<div className="space-y-2">
						<Label htmlFor="legal-name">Name</Label>
						<Input
							id="legal-name"
							name="name"
							placeholder="Privacy Policy"
							required
							autoFocus
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="legal-slug">Public slug</Label>
						<Input
							id="legal-slug"
							name="slug"
							placeholder="privacy-policy"
							required
						/>
						<p className="text-xs text-slate-500">
							Normalized to lowercase kebab-case.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="legal-type">Document type</Label>
						<Select name="type" required>
							<SelectTrigger id="legal-type">
								<SelectValue placeholder="Choose a type" />
							</SelectTrigger>
							<SelectContent>
								{documentTypes.map(type => (
									<SelectItem key={type.value} value={type.value}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{error ? <p className="text-sm text-red-600">{error}</p> : null}
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
						<Button variant="outline" asChild>
							<Link to="/edge-cms/legal">Cancel</Link>
						</Button>
						<Button type="submit" disabled={fetcher.state !== 'idle'}>
							{fetcher.state !== 'idle' ? 'Creating…' : 'Create document'}
						</Button>
					</div>
				</fetcher.Form>
			</div>
		</div>
	);
}
