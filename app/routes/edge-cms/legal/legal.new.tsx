import { env } from 'cloudflare:workers';
import kebabCase from 'lodash-es/kebabCase.js';
import { ArrowLeft } from 'lucide-react';
import { Link, redirect, useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { requireAuth } from '~/utils/auth.middleware';
import { getLanguages, type LegalDocumentType } from '~/utils/db.server';
import { createLanguage } from '~/utils/services/languages.server';
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
	const name = String(formData.get('name') ?? '');
	const languages = await getLanguages();
	if (languages.length === 0) {
		const language = await createLanguage('en', { userId: user.id });
		if (!language.ok) return toResponse(language);
	}
	const result = await createLegalDocument({
		name,
		slug: kebabCase(name),
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
						<Label htmlFor="legal-type">Document type</Label>
						<select
							id="legal-type"
							name="type"
							defaultValue=""
							required
							className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
						>
							<option value="" disabled>
								Choose a type
							</option>
							{documentTypes.map(type => (
								<option key={type.value} value={type.value}>
									{type.label}
								</option>
							))}
						</select>
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
