import { env } from 'cloudflare:workers';
import {
	AlertTriangle,
	Archive,
	ArrowLeft,
	CheckCircle2,
	Clock3,
	ExternalLink,
	FileSignature,
	RefreshCw,
	Save,
	ShieldCheck,
	Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	Link,
	redirect,
	useFetcher,
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from 'react-router';
import { MarkdownInput } from '~/components/markdown-editor';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getLanguages,
	getLegalDocumentById,
	getLegalDrafts,
	getLegalReleaseVariants,
	getLegalReleases,
	type LegalDocumentType,
	type LegalReleaseStatus,
} from '~/utils/db.server';
import {
	activateLegalRelease,
	deleteLegalDocument,
	publishLegalDocument,
	retireLegalRelease,
	retryLegalRelease,
	saveLegalDraft,
	updateLegalDocument,
} from '~/utils/services/legal.server';
import { toResponse } from '~/utils/services/result';
import type { Route } from './+types/legal.$id';

function parseId(value: string | undefined) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireAuth(request, env);
	const documentId = parseId(params.id);
	if (!documentId)
		throw new Response('Legal document not found', { status: 404 });

	const [document, drafts, languages, releases] = await Promise.all([
		getLegalDocumentById(documentId),
		getLegalDrafts(documentId),
		getLanguages(),
		getLegalReleases(documentId),
	]);
	if (!document)
		throw new Response('Legal document not found', { status: 404 });
	const variants = (
		await Promise.all(
			releases.map(release => getLegalReleaseVariants(release.id)),
		)
	).flat();

	return { document, drafts, languages, releases, variants };
}

export async function action({ request, params }: Route.ActionArgs) {
	const { user } = await requireAuth(request, env);
	const documentId = parseId(params.id);
	if (!documentId) {
		return Response.json(
			{ error: 'Legal document not found' },
			{ status: 404 },
		);
	}
	const formData = await request.formData();
	const intent = String(formData.get('intent') ?? '');

	switch (intent) {
		case 'update-document':
			return toResponse(
				await updateLegalDocument({
					documentId,
					name: String(formData.get('name') ?? ''),
					slug: String(formData.get('slug') ?? ''),
					type: String(formData.get('type') ?? '') as LegalDocumentType,
				}),
			);
		case 'save-draft':
			return toResponse(
				await saveLegalDraft({
					documentId,
					locale: String(formData.get('locale') ?? ''),
					markdown: String(formData.get('markdown') ?? ''),
					userId: user.id,
				}),
			);
		case 'publish':
			return toResponse(
				await publishLegalDocument({
					documentId,
					version: String(formData.get('version') ?? ''),
					effectiveDate: String(formData.get('effectiveDate') ?? ''),
					userId: user.id,
				}),
				202,
			);
		case 'retry': {
			const releaseId = parseId(String(formData.get('releaseId') ?? ''));
			return releaseId
				? toResponse(await retryLegalRelease(releaseId), 202)
				: Response.json({ error: 'Legal release not found' }, { status: 404 });
		}
		case 'activate': {
			const releaseId = parseId(String(formData.get('releaseId') ?? ''));
			return releaseId
				? toResponse(await activateLegalRelease(releaseId))
				: Response.json({ error: 'Legal release not found' }, { status: 404 });
		}
		case 'retire': {
			const releaseId = parseId(String(formData.get('releaseId') ?? ''));
			return releaseId
				? toResponse(await retireLegalRelease(releaseId))
				: Response.json({ error: 'Legal release not found' }, { status: 404 });
		}
		case 'delete': {
			const result = await deleteLegalDocument(documentId);
			return result.ok ? redirect('/edge-cms/legal') : toResponse(result);
		}
		default:
			return Response.json({ error: 'Invalid action' }, { status: 400 });
	}
}

function responseError(data: unknown) {
	if (data && typeof data === 'object' && 'error' in data) {
		const error = (data as { error?: unknown }).error;
		return typeof error === 'string' ? error : null;
	}
	return null;
}

function statusAppearance(status: LegalReleaseStatus) {
	switch (status) {
		case 'active':
			return 'border-emerald-200 bg-emerald-50 text-emerald-700';
		case 'published':
			return 'border-sky-200 bg-sky-50 text-sky-700';
		case 'processing':
			return 'border-amber-200 bg-amber-50 text-amber-700';
		case 'failed':
			return 'border-red-200 bg-red-50 text-red-700';
		case 'retired':
			return 'border-slate-200 bg-slate-100 text-slate-600';
	}
}

function DraftEditor({
	locale,
	initialMarkdown,
}: {
	locale: string;
	initialMarkdown: string;
}) {
	const [markdown, setMarkdown] = useState(initialMarkdown);
	const fetcher = useFetcher<typeof action>();
	const error = responseError(fetcher.data);
	const saved = fetcher.state === 'idle' && fetcher.data && !error;

	return (
		<fetcher.Form method="post" className="space-y-3">
			<input type="hidden" name="intent" value="save-draft" />
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="markdown" value={markdown} />
			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
					<div>
						<p className="text-sm font-semibold text-slate-900">{locale}</p>
						<p className="text-xs text-slate-500">
							Exact Markdown is frozen only when you publish.
						</p>
					</div>
					<Button type="submit" size="sm" disabled={fetcher.state !== 'idle'}>
						<Save className="mr-2 h-3.5 w-3.5" />
						{fetcher.state !== 'idle' ? 'Saving…' : 'Save draft'}
					</Button>
				</div>
				<MarkdownInput
					value={markdown}
					onChange={setMarkdown}
					height={560}
					label={`${locale} legal document Markdown`}
				/>
			</div>
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
			{saved ? <p className="text-sm text-emerald-700">Draft saved.</p> : null}
		</fetcher.Form>
	);
}

function MetadataForm({
	document,
	identityFrozen,
}: {
	document: Awaited<ReturnType<typeof loader>>['document'];
	identityFrozen: boolean;
}) {
	const fetcher = useFetcher<typeof action>();
	const error = responseError(fetcher.data);
	return (
		<fetcher.Form
			method="post"
			className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3"
		>
			<input type="hidden" name="intent" value="update-document" />
			<div className="space-y-2 sm:col-span-3">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold tracking-tight text-slate-950">
						Document identity
					</h2>
					<Button type="submit" variant="outline" size="sm">
						Save details
					</Button>
				</div>
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
			</div>
			<div className="space-y-2">
				<Label htmlFor="document-name">Name</Label>
				<Input id="document-name" name="name" defaultValue={document.name} />
			</div>
			<div className="space-y-2">
				<Label htmlFor="document-slug">Public slug</Label>
				<Input
					id="document-slug"
					name="slug"
					defaultValue={document.slug}
					readOnly={identityFrozen}
					className={identityFrozen ? 'bg-slate-50 text-slate-500' : undefined}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="document-type">Type</Label>
				{identityFrozen ? (
					<input type="hidden" name="type" value={document.type} />
				) : null}
				<select
					id="document-type"
					name="type"
					defaultValue={document.type}
					disabled={identityFrozen}
					className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
				>
					<option value="terms_and_conditions">Terms and conditions</option>
					<option value="privacy_policy">Privacy policy</option>
					<option value="cookie_policy">Cookie policy</option>
					<option value="dpa">Data processing agreement</option>
					<option value="other">Other agreement</option>
				</select>
			</div>
			{identityFrozen ? (
				<p className="text-xs text-slate-500 sm:col-span-3">
					Slug and type are part of signed releases, so only the display name
					can change after publication begins.
				</p>
			) : null}
		</fetcher.Form>
	);
}

export default function LegalDocumentPage() {
	const { document, drafts, languages, releases, variants } =
		useLoaderData<typeof loader>();
	const [searchParams, setSearchParams] = useSearchParams();
	const revalidator = useRevalidator();
	const publishFetcher = useFetcher<typeof action>();
	const lifecycleFetcher = useFetcher<typeof action>();
	const deleteFetcher = useFetcher<typeof action>();
	const defaultLocale =
		languages.find(language => language.default)?.locale ??
		languages[0]?.locale;
	const requestedLocale = searchParams.get('locale');
	const selectedLocale =
		languages.find(language => language.locale === requestedLocale)?.locale ??
		defaultLocale;
	const draft = drafts.find(candidate => candidate.locale === selectedLocale);
	const isProcessing = releases.some(
		release => release.status === 'processing',
	);

	useEffect(() => {
		if (!isProcessing) return;
		const interval = window.setInterval(() => revalidator.revalidate(), 2500);
		return () => window.clearInterval(interval);
	}, [isProcessing, revalidator]);

	return (
		<div className="container mx-auto max-w-7xl py-8">
			<Link
				to="/edge-cms/legal"
				className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
			>
				<ArrowLeft className="h-4 w-4" />
				Legal documents
			</Link>
			<WorkspacePageHeader
				eyebrow="Legal document"
				title={document.name}
				description={`/${document.slug} · ${document.type.replaceAll('_', ' ')}`}
				density="compact"
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="min-w-0 space-y-6">
					<MetadataForm
						document={document}
						identityFrozen={releases.length > 0}
					/>

					<section>
						<div className="mb-3 flex flex-wrap items-center gap-2">
							{languages.map(language => {
								const hasDraft = drafts.some(
									candidate =>
										candidate.locale === language.locale &&
										candidate.markdown.trim().length > 0,
								);
								return (
									<button
										key={language.locale}
										type="button"
										onClick={() =>
											setSearchParams(
												{ locale: language.locale },
												{ replace: true },
											)
										}
										className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
											selectedLocale === language.locale
												? 'border-sky-600 bg-sky-600 text-white'
												: 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
										}`}
									>
										{language.locale}
										{language.default ? ' · default' : ''}
										{hasDraft ? ' ✓' : ''}
									</button>
								);
							})}
						</div>
						{selectedLocale ? (
							<DraftEditor
								key={selectedLocale}
								locale={selectedLocale}
								initialMarkdown={draft?.markdown ?? ''}
							/>
						) : (
							<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
								Configure at least one locale in Translations before drafting.
							</div>
						)}
					</section>
				</div>

				<aside className="space-y-5">
					<section className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300/40">
						<div className="flex items-center gap-2 text-sky-300">
							<FileSignature className="h-4 w-4" />
							<p className="text-xs font-semibold tracking-[0.16em] uppercase">
								Freeze a release
							</p>
						</div>
						<p className="mt-3 text-sm leading-relaxed text-slate-300">
							Every non-empty locale is copied byte-for-byte, hashed, signed,
							and rendered to PDF.
						</p>
						<publishFetcher.Form method="post" className="mt-5 space-y-4">
							<input type="hidden" name="intent" value="publish" />
							<div className="space-y-1.5">
								<Label htmlFor="release-version" className="text-slate-200">
									Version
								</Label>
								<Input
									id="release-version"
									name="version"
									placeholder="2026.1"
									required
									className="border-slate-700 bg-slate-900 text-white"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="effective-date" className="text-slate-200">
									Effective date
								</Label>
								<Input
									id="effective-date"
									name="effectiveDate"
									type="date"
									required
									className="border-slate-700 bg-slate-900 text-white"
								/>
							</div>
							{responseError(publishFetcher.data) ? (
								<p className="text-sm text-red-300">
									{responseError(publishFetcher.data)}
								</p>
							) : null}
							<Button
								type="submit"
								disabled={publishFetcher.state !== 'idle' || !selectedLocale}
								className="w-full bg-fuchsia-500 shadow-fuchsia-950/40 hover:bg-fuchsia-400"
							>
								{publishFetcher.state !== 'idle'
									? 'Starting…'
									: 'Publish signed release'}
							</Button>
						</publishFetcher.Form>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="font-semibold tracking-tight text-slate-950">
								Release history
							</h2>
							<span className="text-xs text-slate-500 tabular-nums">
								{releases.length}
							</span>
						</div>
						{releases.length === 0 ? (
							<p className="text-sm text-slate-500">No releases yet.</p>
						) : (
							<div className="space-y-4">
								{releases.map(release => {
									const releaseVariants = variants.filter(
										variant => variant.releaseId === release.id,
									);
									return (
										<article
											key={release.id}
											className="border-l-2 border-sky-400 pl-3"
										>
											<div className="flex items-center justify-between gap-2">
												<div>
													<p className="text-sm font-semibold text-slate-900">
														v{release.version}
													</p>
													<p className="text-xs text-slate-500">
														Effective {release.effectiveDate}
													</p>
												</div>
												<Badge
													variant="outline"
													className={statusAppearance(release.status)}
												>
													{release.status === 'processing' ? (
														<Clock3 className="h-3 w-3" />
													) : release.status === 'failed' ? (
														<AlertTriangle className="h-3 w-3" />
													) : release.status === 'active' ? (
														<ShieldCheck className="h-3 w-3" />
													) : (
														<CheckCircle2 className="h-3 w-3" />
													)}
													{release.status}
												</Badge>
											</div>
											{release.failureReason ? (
												<p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
													{release.failureReason}
												</p>
											) : null}
											<div className="mt-2 space-y-1.5">
												{releaseVariants.map(variant => (
													<div
														key={variant.id}
														className="rounded-lg bg-slate-50 px-2.5 py-2"
													>
														<div className="flex items-center justify-between text-xs">
															<span className="font-medium text-slate-700">
																{variant.locale}
															</span>
															{release.status === 'active' &&
															variant.releaseHash ? (
																<a
																	href={`/edge-cms/public/legal/${document.slug}/${variant.locale}.pdf`}
																	target="_blank"
																	rel="noreferrer"
																	className="inline-flex items-center gap-1 text-sky-700 hover:underline"
																>
																	PDF <ExternalLink className="h-3 w-3" />
																</a>
															) : null}
														</div>
														{variant.releaseHash ? (
															<code
																title={variant.releaseHash}
																className="mt-1 block truncate font-mono text-[10px] text-slate-500"
															>
																{variant.releaseHash}
															</code>
														) : (
															<p className="mt-1 text-[10px] text-slate-400">
																Evidence pending
															</p>
														)}
													</div>
												))}
											</div>
											{release.status === 'failed' ||
											release.status === 'published' ||
											release.status === 'active' ? (
												<lifecycleFetcher.Form method="post" className="mt-2">
													<input
														type="hidden"
														name="releaseId"
														value={release.id}
													/>
													<Button
														type="submit"
														name="intent"
														value={
															release.status === 'failed'
																? 'retry'
																: release.status === 'published'
																	? 'activate'
																	: 'retire'
														}
														variant="ghost"
														size="sm"
														className="h-7 px-2 text-xs"
													>
														{release.status === 'failed' ? (
															<RefreshCw className="mr-1 h-3 w-3" />
														) : release.status === 'active' ? (
															<Archive className="mr-1 h-3 w-3" />
														) : (
															<ShieldCheck className="mr-1 h-3 w-3" />
														)}
														{release.status === 'failed'
															? 'Retry'
															: release.status === 'published'
																? 'Activate'
																: 'Retire'}
													</Button>
												</lifecycleFetcher.Form>
											) : null}
										</article>
									);
								})}
							</div>
						)}
					</section>

					<section className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
						<h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
						{releases.length > 0 ? (
							<p className="mt-1 text-xs leading-relaxed text-red-700">
								Documents with release history cannot be deleted.
							</p>
						) : (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" size="sm" className="mt-3">
										<Trash2 className="mr-2 h-3.5 w-3.5" />
										Delete document
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete {document.name}?</AlertDialogTitle>
										<AlertDialogDescription>
											This permanently removes every locale draft.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<deleteFetcher.Form method="post">
											<input type="hidden" name="intent" value="delete" />
											<AlertDialogAction type="submit">
												Delete
											</AlertDialogAction>
										</deleteFetcher.Form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</section>
				</aside>
			</div>
		</div>
	);
}
