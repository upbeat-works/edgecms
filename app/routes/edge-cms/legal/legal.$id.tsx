import { env } from 'cloudflare:workers';
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	Clock3,
	ExternalLink,
	FileSignature,
	Languages,
	RefreshCw,
	ShieldCheck,
	Trash2,
	Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
	WorkspacePageHeader,
	WorkspaceToolbar,
} from '~/components/ui/workspace';
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
	deleteLegalDocument,
	discardFailedLegalRelease,
	publishLegalDocument,
	retryLegalRelease,
	saveLegalDraft,
	updateLegalDocument,
} from '~/utils/services/legal.server';
import { createLanguage } from '~/utils/services/languages.server';
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

	return {
		document,
		drafts,
		languages,
		releases,
		variants,
		publicationDate: new Date().toISOString().slice(0, 10),
	};
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
		case 'start-writing': {
			const languages = await getLanguages();
			if (languages.length > 0) {
				return Response.json({ locale: languages[0].locale });
			}
			return toResponse(await createLanguage('en', { userId: user.id }));
		}
		case 'update-document': {
			const document = await getLegalDocumentById(documentId);
			if (!document) {
				return Response.json(
					{ error: 'Legal document not found' },
					{ status: 404 },
				);
			}
			return toResponse(
				await updateLegalDocument({
					documentId,
					name: String(formData.get('name') ?? ''),
					slug: document.slug,
					type: String(formData.get('type') ?? '') as LegalDocumentType,
				}),
			);
		}
		case 'save-draft':
			return toResponse(
				await saveLegalDraft({
					documentId,
					locale: String(formData.get('locale') ?? ''),
					markdown: String(formData.get('markdown') ?? ''),
					userId: user.id,
				}),
			);
		case 'publish': {
			const publicationDate = new Date().toISOString().slice(0, 10);
			return toResponse(
				await publishLegalDocument({
					documentId,
					version: publicationDate,
					effectiveDate: publicationDate,
					userId: user.id,
				}),
				202,
			);
		}
		case 'retry': {
			const releaseId = parseId(String(formData.get('releaseId') ?? ''));
			return releaseId
				? toResponse(await retryLegalRelease(releaseId), 202)
				: Response.json({ error: 'Legal release not found' }, { status: 404 });
		}
		case 'discard-release': {
			const releaseId = parseId(String(formData.get('releaseId') ?? ''));
			if (!releaseId) {
				return Response.json(
					{ error: 'Legal release not found' },
					{ status: 404 },
				);
			}
			return toResponse(
				await discardFailedLegalRelease({ releaseId, documentId }),
			);
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

function statusLabel(status: LegalReleaseStatus) {
	switch (status) {
		case 'active':
			return 'Published';
		case 'published':
			return 'Ready';
		case 'processing':
			return 'Publishing';
		case 'failed':
			return 'Needs attention';
		case 'retired':
			return 'Previous';
	}
}

function StatusIcon({ status }: { status: LegalReleaseStatus }) {
	switch (status) {
		case 'processing':
			return <Clock3 className="h-3 w-3" />;
		case 'failed':
			return <AlertTriangle className="h-3 w-3" />;
		case 'active':
			return <ShieldCheck className="h-3 w-3" />;
		case 'published':
		case 'retired':
			return <CheckCircle2 className="h-3 w-3" />;
	}
}

function formatPublicationDate(value: string) {
	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeZone: 'UTC',
	}).format(new Date(`${value}T00:00:00.000Z`));
}

function languageLabel(locale: string) {
	try {
		return (
			new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
		);
	} catch {
		return locale;
	}
}

export const LEGAL_DRAFT_AUTOSAVE_DELAY_MS = 700;

export function scheduleLegalDraftAutosave({
	markdown,
	savedMarkdown,
	save,
}: {
	markdown: string;
	savedMarkdown: string;
	save: (markdown: string) => void;
}) {
	if (markdown === savedMarkdown) return () => undefined;

	const timeout = setTimeout(
		() => save(markdown),
		LEGAL_DRAFT_AUTOSAVE_DELAY_MS,
	);
	return () => clearTimeout(timeout);
}

type DraftSaveStatus = 'saved' | 'waiting' | 'saving' | 'error';

function DraftSaveIndicator({ status }: { status: DraftSaveStatus }) {
	if (status === 'error') {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
				<AlertTriangle className="h-3.5 w-3.5" />
				Not saved
			</span>
		);
	}

	if (status === 'waiting' || status === 'saving') {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
				<RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
				Saving…
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
			<CheckCircle2 className="h-3.5 w-3.5" />
			Saved
		</span>
	);
}

function DraftEditor({
	locale,
	initialMarkdown,
	onSaveStatusChange,
}: {
	locale: string;
	initialMarkdown: string;
	onSaveStatusChange: (status: DraftSaveStatus) => void;
}) {
	const [markdown, setMarkdown] = useState(initialMarkdown);
	const [importedFilename, setImportedFilename] = useState<string | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('saved');
	const fetcher = useFetcher<typeof action>();
	const submitDraft = fetcher.submit;
	const lastSavedMarkdownRef = useRef(initialMarkdown);
	const pendingMarkdownRef = useRef<string | null>(null);
	const markdownRef = useRef(markdown);
	const language = languageLabel(locale);
	markdownRef.current = markdown;

	useEffect(() => {
		onSaveStatusChange(saveStatus);
	}, [onSaveStatusChange, saveStatus]);

	const saveDraft = useCallback(
		(nextMarkdown: string) => {
			pendingMarkdownRef.current = nextMarkdown;
			setSaveStatus('saving');
			submitDraft(
				{
					intent: 'save-draft',
					locale,
					markdown: nextMarkdown,
				},
				{ method: 'post' },
			);
		},
		[locale, submitDraft],
	);

	useEffect(() => {
		if (fetcher.state !== 'idle') return;
		const pendingMarkdown = pendingMarkdownRef.current;
		if (pendingMarkdown === null) return;
		pendingMarkdownRef.current = null;

		if (responseError(fetcher.data)) {
			setSaveStatus('error');
			return;
		}

		lastSavedMarkdownRef.current = pendingMarkdown;
		if (markdownRef.current === pendingMarkdown) {
			setSaveStatus('saved');
			return;
		}
		setSaveStatus('waiting');
	}, [fetcher.data, fetcher.state]);

	useEffect(() => {
		if (fetcher.state !== 'idle') return;
		if (saveStatus === 'saving' || saveStatus === 'error') return;
		return scheduleLegalDraftAutosave({
			markdown,
			savedMarkdown: lastSavedMarkdownRef.current,
			save: saveDraft,
		});
	}, [fetcher.state, markdown, saveDraft, saveStatus]);

	const updateMarkdown = (nextMarkdown: string) => {
		markdownRef.current = nextMarkdown;
		setMarkdown(nextMarkdown);
		const matchesStoredDraft =
			nextMarkdown === lastSavedMarkdownRef.current &&
			pendingMarkdownRef.current === null;
		setSaveStatus(matchesStoredDraft ? 'saved' : 'waiting');
	};

	const error = saveStatus === 'error' ? responseError(fetcher.data) : null;

	return (
		<div className="space-y-3">
			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
					<div>
						<p className="text-sm font-semibold text-slate-900">
							{language} document
						</p>
						<p className="text-xs text-slate-500">
							Write here, paste content, or import a Markdown file.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<div role="status" aria-live="polite" className="px-1">
							<DraftSaveIndicator status={saveStatus} />
						</div>
						<label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 hover:bg-slate-50">
							<Upload className="mr-2 h-3.5 w-3.5" />
							Import .md
							<input
								type="file"
								accept=".md,.markdown,text/markdown,text/plain"
								className="sr-only"
								onChange={async event => {
									const input = event.currentTarget;
									const file = input.files?.[0];
									if (!file) return;

									try {
										updateMarkdown(await file.text());
										setImportedFilename(file.name);
										setImportError(null);
									} catch {
										setImportError('Could not read that Markdown file.');
									} finally {
										input.value = '';
									}
								}}
							/>
						</label>
					</div>
				</div>
				<MarkdownInput
					value={markdown}
					onChange={updateMarkdown}
					height={560}
					label={`${language} legal document Markdown`}
				/>
			</div>
			{importedFilename ? (
				<p className="text-sm text-sky-700">Imported {importedFilename}.</p>
			) : null}
			{importError ? (
				<p className="text-sm text-red-600">{importError}</p>
			) : null}
			{error ? (
				<div className="flex flex-wrap items-center gap-2 text-sm text-red-700">
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setSaveStatus('waiting')}
						className="font-semibold underline underline-offset-2 hover:text-red-900 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
					>
						Try again
					</button>
				</div>
			) : null}
		</div>
	);
}

function MetadataForm({
	document,
	typeMode,
}: {
	document: Awaited<ReturnType<typeof loader>>['document'];
	typeMode: 'editable' | 'fixed';
}) {
	const fetcher = useFetcher<typeof action>();
	const error = responseError(fetcher.data);
	return (
		<details className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
				<div>
					<h2 className="text-sm font-semibold tracking-tight text-slate-950">
						Document settings
					</h2>
					<p className="mt-0.5 text-xs text-slate-500">Name and type</p>
				</div>
				<ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
			</summary>
			<fetcher.Form
				method="post"
				className="space-y-4 border-t border-slate-100 p-4"
			>
				<input type="hidden" name="intent" value="update-document" />
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
				<div className="space-y-2">
					<Label htmlFor="document-name">Name</Label>
					<Input id="document-name" name="name" defaultValue={document.name} />
				</div>
				<div className="space-y-2">
					<Label htmlFor="document-type">Type</Label>
					{typeMode === 'fixed' ? (
						<input type="hidden" name="type" value={document.type} />
					) : null}
					<select
						id="document-type"
						name="type"
						defaultValue={document.type}
						disabled={typeMode === 'fixed'}
						className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
					>
						<option value="terms_and_conditions">Terms and conditions</option>
						<option value="privacy_policy">Privacy policy</option>
						<option value="cookie_policy">Cookie policy</option>
						<option value="dpa">Data processing agreement</option>
						<option value="other">Other agreement</option>
					</select>
					{typeMode === 'fixed' ? (
						<p className="text-xs leading-relaxed text-slate-500">
							The type stays fixed after the first publication.
						</p>
					) : null}
				</div>
				<div className="flex justify-end">
					<Button type="submit" variant="outline" size="sm">
						Save settings
					</Button>
				</div>
			</fetcher.Form>
		</details>
	);
}

export default function LegalDocumentPage() {
	const { document, drafts, languages, releases, variants, publicationDate } =
		useLoaderData<typeof loader>();
	const [searchParams, setSearchParams] = useSearchParams();
	const revalidator = useRevalidator();
	const publishFetcher = useFetcher<typeof action>();
	const retryFetcher = useFetcher<typeof action>();
	const discardFetcher = useFetcher<typeof action>();
	const setupFetcher = useFetcher<typeof action>();
	const deleteFetcher = useFetcher<typeof action>();
	const [draftSaveStatus, setDraftSaveStatus] =
		useState<DraftSaveStatus>('saved');
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
	const hasPublishableDraft = drafts.some(
		candidate =>
			candidate.locale === defaultLocale &&
			candidate.markdown.trim().length > 0,
	);
	let publishButtonLabel = 'Publish';
	if (publishFetcher.state !== 'idle') publishButtonLabel = 'Starting…';
	if (isProcessing) publishButtonLabel = 'Publishing…';
	let publishHelp: string | null = null;
	if (!hasPublishableDraft) {
		publishHelp = 'Add content in the primary language before publishing.';
	} else if (draftSaveStatus !== 'saved') {
		publishHelp = 'Finish saving before publishing.';
	}

	useEffect(() => {
		if (!isProcessing) return;
		const interval = window.setInterval(() => revalidator.revalidate(), 2500);
		return () => window.clearInterval(interval);
	}, [isProcessing, revalidator]);

	return (
		<main className="container mx-auto max-w-7xl px-4 py-4 lg:py-5">
			<Link
				to="/edge-cms/legal"
				className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
			>
				<ArrowLeft className="h-4 w-4" />
				Legal documents
			</Link>
			<WorkspacePageHeader
				eyebrow="Document editor"
				title={document.name}
				description="Write, review, and publish the document your customers will read."
				density="compact"
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="min-w-0 space-y-6">
					<section>
						<WorkspaceToolbar
							label="Document languages"
							className="justify-between"
						>
							<div className="flex flex-wrap items-center gap-2">
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
											disabled={
												draftSaveStatus !== 'saved' &&
												selectedLocale !== language.locale
											}
											onClick={() =>
												setSearchParams(
													{ locale: language.locale },
													{ replace: true },
												)
											}
											className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
												selectedLocale === language.locale
													? 'border-sky-600 bg-sky-600 text-white'
													: 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
											}`}
										>
											{languageLabel(language.locale)}
											{language.default ? ' · primary' : ''}
											{hasDraft ? ' ✓' : ''}
										</button>
									);
								})}
							</div>
							{languages.length > 0 ? (
								<Link
									to="/edge-cms/i18n"
									className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900"
								>
									<Languages className="h-4 w-4" />
									Manage languages
								</Link>
							) : null}
						</WorkspaceToolbar>
						{selectedLocale ? (
							<DraftEditor
								key={selectedLocale}
								locale={selectedLocale}
								initialMarkdown={draft?.markdown ?? ''}
								onSaveStatusChange={setDraftSaveStatus}
							/>
						) : (
							<div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-6 py-14 text-center">
								<FileSignature className="mx-auto h-8 w-8 text-sky-600" />
								<h2 className="mt-4 text-lg font-semibold text-slate-950">
									Start writing
								</h2>
								<p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-600">
									We’ll prepare an English document first. You can add
									translations later.
								</p>
								<setupFetcher.Form method="post" className="mt-5">
									<input type="hidden" name="intent" value="start-writing" />
									<Button
										type="submit"
										disabled={setupFetcher.state !== 'idle'}
									>
										{setupFetcher.state !== 'idle'
											? 'Preparing…'
											: 'Start writing'}
									</Button>
								</setupFetcher.Form>
							</div>
						)}
					</section>
				</div>

				<aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
					<section className="overflow-hidden rounded-xl border border-t-2 border-slate-200 border-t-sky-500 bg-white shadow-sm">
						<div className="border-b border-slate-100 p-5">
							<div className="flex items-center gap-2 text-sky-700">
								<FileSignature className="h-4 w-4" />
								<p className="text-xs font-semibold tracking-[0.14em] uppercase">
									Publication
								</p>
							</div>
							<h2 className="mt-3 font-semibold tracking-tight text-slate-950">
								Publish this document
							</h2>
							<p className="mt-1 text-sm leading-relaxed text-slate-600">
								Creates a dated PDF and keeps older publications in history.
							</p>
						</div>
						<div className="p-5">
							<div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
								<p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
									Publication date
								</p>
								<time className="mt-0.5 block text-sm font-semibold text-slate-950">
									{formatPublicationDate(publicationDate)}
								</time>
							</div>
							<publishFetcher.Form method="post" className="mt-4 space-y-3">
								<input type="hidden" name="intent" value="publish" />
								{responseError(publishFetcher.data) ? (
									<p className="text-sm text-red-700">
										{responseError(publishFetcher.data)}
									</p>
								) : null}
								<Button
									type="submit"
									disabled={
										publishFetcher.state !== 'idle' ||
										isProcessing ||
										!hasPublishableDraft ||
										draftSaveStatus !== 'saved'
									}
									className="w-full"
								>
									{publishButtonLabel}
								</Button>
								{publishHelp ? (
									<p className="text-xs leading-relaxed text-slate-500">
										{publishHelp}
									</p>
								) : null}
							</publishFetcher.Form>
						</div>
					</section>

					<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="font-semibold tracking-tight text-slate-950">
								Publication history
							</h2>
							<span className="text-xs text-slate-500 tabular-nums">
								{releases.length}
							</span>
						</div>
						{responseError(discardFetcher.data) ? (
							<p className="mb-3 text-sm text-red-700">
								{responseError(discardFetcher.data)}
							</p>
						) : null}
						{releases.length === 0 ? (
							<p className="text-sm text-slate-500">
								Published documents will appear here by date.
							</p>
						) : (
							<div className="space-y-4">
								{releases.map(release => {
									const releaseVariants = variants.filter(
										variant => variant.releaseId === release.id,
									);
									const isDiscarding =
										discardFetcher.state !== 'idle' &&
										discardFetcher.formData?.get('releaseId') ===
											String(release.id);
									return (
										<article
											key={release.id}
											className="border-l-2 border-sky-400 pl-3"
										>
											<div className="flex items-center justify-between gap-2">
												<div>
													<p className="text-sm font-semibold text-slate-900">
														{formatPublicationDate(release.effectiveDate)}
													</p>
												</div>
												<Badge
													variant="outline"
													className={statusAppearance(release.status)}
												>
													<StatusIcon status={release.status} />
													{statusLabel(release.status)}
												</Badge>
											</div>
											{release.failureReason ? (
												<p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
													{release.failureReason}
												</p>
											) : null}
											{release.status === 'active' ||
											release.status === 'published' ||
											release.status === 'retired' ? (
												<div className="mt-2 flex flex-wrap gap-2">
													{releaseVariants.map(variant => {
														if (!variant.releaseHash) return null;
														return (
															<span
																key={variant.id}
																className="inline-flex flex-wrap gap-1"
															>
																<a
																	href={`/edge-cms/public/legal/${encodeURIComponent(document.slug)}/${encodeURIComponent(variant.locale)}/releases/${variant.releaseHash}.md`}
																	target="_blank"
																	rel="noreferrer"
																	className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
																>
																	{languageLabel(variant.locale)} Markdown
																	<ExternalLink className="h-3 w-3" />
																</a>
																<a
																	href={`/edge-cms/public/legal/${encodeURIComponent(document.slug)}/${encodeURIComponent(variant.locale)}/releases/${variant.releaseHash}.pdf`}
																	target="_blank"
																	rel="noreferrer"
																	className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
																>
																	{languageLabel(variant.locale)} PDF
																	<ExternalLink className="h-3 w-3" />
																</a>
															</span>
														);
													})}
												</div>
											) : null}
											{release.status === 'processing' ? (
												<p className="mt-2 text-xs text-slate-500">
													Preparing the published PDF…
												</p>
											) : null}
											{release.status === 'failed' ? (
												<div className="mt-2 flex flex-wrap items-center gap-1">
													<retryFetcher.Form method="post">
														<input
															type="hidden"
															name="releaseId"
															value={release.id}
														/>
														<Button
															type="submit"
															name="intent"
															value="retry"
															variant="ghost"
															size="sm"
															className="h-7 px-2 text-xs"
														>
															<RefreshCw className="mr-1 h-3 w-3" />
															Try again
														</Button>
													</retryFetcher.Form>
													<discardFetcher.Form method="post">
														<input
															type="hidden"
															name="intent"
															value="discard-release"
														/>
														<input
															type="hidden"
															name="releaseId"
															value={release.id}
														/>
														<Button
															type="submit"
															disabled={discardFetcher.state !== 'idle'}
															variant="ghost"
															size="sm"
															className="h-7 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
														>
															<Trash2 className="mr-1 h-3 w-3" />
															{isDiscarding ? 'Discarding…' : 'Discard'}
														</Button>
													</discardFetcher.Form>
												</div>
											) : null}
										</article>
									);
								})}
							</div>
						)}
					</section>

					<MetadataForm
						document={document}
						typeMode={releases.length > 0 ? 'fixed' : 'editable'}
					/>

					{releases.length === 0 ? (
						<details className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-slate-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
								Delete document
								<ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
							</summary>
							<div className="border-t border-slate-100 p-4">
								<p className="text-xs leading-relaxed text-slate-600">
									Permanently removes this draft and its content.
								</p>
								<deleteFetcher.Form
									id="delete-legal-document"
									method="post"
									className="hidden"
								>
									<input type="hidden" name="intent" value="delete" />
								</deleteFetcher.Form>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button variant="destructive" size="sm" className="mt-3">
											<Trash2 className="mr-2 h-3.5 w-3.5" />
											Delete document
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												Delete {document.name}?
											</AlertDialogTitle>
											<AlertDialogDescription>
												This permanently removes the document and its saved
												content.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												type="submit"
												form="delete-legal-document"
												disabled={deleteFetcher.state !== 'idle'}
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						</details>
					) : null}
				</aside>
			</div>
		</main>
	);
}
