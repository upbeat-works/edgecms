import { env } from 'cloudflare:workers';
import { FileCheck2, Plus, ShieldCheck } from 'lucide-react';
import { Link, useLoaderData } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { requireAuth } from '~/utils/auth.middleware';
import { getLegalDocuments } from '~/utils/db.server';
import type { Route } from './+types/legal';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);
	return { documents: await getLegalDocuments() };
}

function documentTypeLabel(value: string) {
	return value
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export default function LegalPage() {
	const { documents } = useLoaderData<typeof loader>();

	return (
		<div className="container mx-auto max-w-6xl py-10">
			<WorkspacePageHeader
				eyebrow="Trust center"
				title="Legal documents"
				description="Draft localized policies, freeze signed releases, and control exactly which version is active."
				actions={
					<Button asChild>
						<Link to="/edge-cms/legal/new">
							<Plus className="mr-2 h-4 w-4" />
							New document
						</Link>
					</Button>
				}
			/>

			{documents.length === 0 ? (
				<EmptyState
					title="Your legal library starts here"
					description="Create a policy or agreement, add its localized Markdown, then publish a signed release."
					action={
						<Button asChild>
							<Link to="/edge-cms/legal/new">Create a document</Link>
						</Button>
					}
					className="border border-dashed border-sky-200 bg-white"
				/>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{documents.map(document => (
						<Link
							key={document.id}
							to={`/edge-cms/legal/${document.id}`}
							className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100/60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
						>
							<span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 via-sky-500 to-fuchsia-500" />
							<div className="flex items-start justify-between gap-4">
								<div className="flex min-w-0 items-start gap-3">
									<span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
										<FileCheck2 className="h-5 w-5" />
									</span>
									<div className="min-w-0">
										<h2 className="truncate font-semibold tracking-tight text-slate-950 group-hover:text-sky-700">
											{document.name}
										</h2>
										<p className="mt-0.5 font-mono text-xs text-slate-500">
											/{document.slug}
										</p>
									</div>
								</div>
								{document.activeVersion ? (
									<Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
										<ShieldCheck className="h-3 w-3" />v{document.activeVersion}
									</Badge>
								) : (
									<Badge variant="outline" className="text-slate-500">
										No active release
									</Badge>
								)}
							</div>
							<div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
								<span>{documentTypeLabel(document.type)}</span>
								<span>
									{document.draftLocaleCount}{' '}
									{document.draftLocaleCount === 1 ? 'locale' : 'locales'} ·{' '}
									{document.releaseCount}{' '}
									{document.releaseCount === 1 ? 'release' : 'releases'}
								</span>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
