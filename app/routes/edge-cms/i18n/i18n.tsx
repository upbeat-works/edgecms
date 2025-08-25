import {
	useLoaderData,
	useFetcher,
	Form,
	Link,
	redirect,
	useRevalidator,
	useSearchParams,
} from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { FixedSizeGrid } from 'react-window';
import { requireAuth } from '~/lib/auth.middleware';
import {
	getLanguages,
	getSections,
	getTranslations,
	upsertTranslation,
	createLanguage,
	setDefaultLanguage,
	type Language,
	type Section,
	type Translation,
	getLatestVersion,
	createVersion,
	bulkUpsertTranslations,
	runAITranslation,
	getAITranslateInstance,
	updateTranslationKey,
} from '~/lib/db.server';

import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { useBackoffCallback } from '~/hooks/use-poll-exponential-backoff';
import { env } from 'cloudflare:workers';
import { VirtualizedCell } from './virtualized-cell';
import { KeyCell } from './key-cell';
import {
	AddLanguageDialog,
	AddTranslationDialog,
	ImportJsonDialog,
	AiTranslateButton,
	AiTranslationProgressDialog,
} from './dialog-components';
import type { Route } from './+types/i18n';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);

	const url = new URL(request.url);
	const sectionFilter = url.searchParams.get('section');
	const aiTranslateId = url.searchParams.get('aiTranslateId');

	const [
		languages,
		sections,
		translations,
		activeVersion,
		aiTranslateInstance,
	] = await Promise.all([
		getLanguages(),
		getSections(),
		getTranslations({
			section: sectionFilter || undefined,
		}),
		getLatestVersion('live'),
		aiTranslateId
			? getAITranslateInstance(aiTranslateId)
			: Promise.resolve(null),
	]);

	// Group translations by key
	const translationsByKey = new Map<string, Map<string, Translation>>();
	for (const translation of translations) {
		if (!translationsByKey.has(translation.key)) {
			translationsByKey.set(translation.key, new Map());
		}
		translationsByKey
			.get(translation.key)!
			.set(translation.language, translation);
	}

	let aiTranslateStatus = null;
	if (aiTranslateInstance != null) {
		aiTranslateStatus = await aiTranslateInstance.status();
	}

	// Check if OpenAI API key is available
	const isAiAvailable = Boolean(env.OPENAI_API_KEY);

	return {
		languages,
		sections,
		translations: translationsByKey,
		sectionFilter,
		activeVersion,
		aiTranslateStatus,
		isAiAvailable,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const auth = await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	// Before any change we need to create a new draft version if none exists
	const [draftVersion, liveVersion] = await Promise.all([
		getLatestVersion('draft'),
		getLatestVersion('live'),
	]);

	if (draftVersion == null) {
		const description = liveVersion
			? `v${liveVersion.id + 1}`
			: new Date().toLocaleDateString();
		await createVersion(description, auth.user.id);
	}

	switch (intent) {
		case 'update-translation': {
			const key = formData.get('key') as string;
			const language = formData.get('language') as string;
			const value = formData.get('value') as string;
			const section = formData.get('section') as string | null;

			await upsertTranslation(key, language, value, section || undefined);
			return Response.json({ success: true });
		}

		case 'add-language': {
			const locale = formData.get('locale') as string;
			await createLanguage(locale);
			return { success: true };
		}

		case 'set-default-language': {
			const locale = formData.get('locale') as string;
			await setDefaultLanguage(locale);
			return { success: true };
		}

		case 'add-translation': {
			const key = formData.get('key') as string;
			const section = formData.get('section') as string | null;

			// Add empty translations for all languages
			const languages = await getLanguages();
			await Promise.all(
				languages.map(async language => {
					await upsertTranslation(
						key,
						language.locale,
						'',
						section || undefined,
					);
				}),
			);
			return { success: true };
		}

		case 'update-section': {
			const key = formData.get('key') as string;
			const newSection = formData.get('section') as string | null;

			// Update section for all translations of this key
			const keyTranslations = await getTranslations({
				key,
			});

			await Promise.all(
				keyTranslations.map(async translation =>
					upsertTranslation(
						translation.key,
						translation.language,
						translation.value,
						newSection || undefined,
					),
				),
			);
			return { success: true };
		}

		case 'import-json': {
			const language = formData.get('language') as string;
			const section = formData.get('section') as string | null;
			const jsonFile = formData.get('jsonFile');
			if (!(jsonFile instanceof File)) {
				return { error: 'Invalid file upload' };
			}
			try {
				const jsonText = await jsonFile.text();
				const translationsMap = JSON.parse(jsonText) as Record<string, string>;
				await bulkUpsertTranslations(
					language,
					translationsMap,
					section || undefined,
				);
				return { success: true };
			} catch (error) {
				return { error: 'Failed to parse JSON: ' + (error as Error).message };
			}
		}

		case 'ai-translate': {
			// Check if OpenAI API key is available
			if (!env.OPENAI_API_KEY) {
				return { error: 'OpenAI API key is not configured' };
			}
			const instanceId = await runAITranslation(auth.user.id);
			return redirect(`/edge-cms/i18n?aiTranslateId=${instanceId}`);
		}

		case 'update-key': {
			const oldKey = formData.get('oldKey') as string;
			const newKey = formData.get('newKey') as string;

			// Validate that the new key is different and not empty
			if (!newKey || newKey.trim() === '' || oldKey === newKey) {
				return Response.json({ 
					success: false, 
					error: 'Key cannot be empty and must be different from the current key' 
				}, { status: 400 });
			}

			// Check if the new key already exists
			const existingTranslations = await getTranslations({ key: newKey });
			if (existingTranslations.length > 0) {
				return Response.json({ 
					success: false, 
					error: 'A translation with this key already exists' 
				}, { status: 400 });
			}

			await updateTranslationKey(oldKey, newKey);
			return Response.json({ success: true });
		}

		default:
			return { error: 'Invalid action' };
	}
}

export default function I18n() {
	const {
		languages,
		sections,
		translations,
		sectionFilter,
		activeVersion,
		aiTranslateStatus,
		isAiAvailable,
	} = useLoaderData<typeof loader>();
	const [showAddLanguage, setShowAddLanguage] = useState(false);
	const [showAddTranslation, setShowAddTranslation] = useState(false);
	const [showImportJson, setShowImportJson] = useState(false);
	const [showAiTranslationProgress, setShowAiTranslationProgress] =
		useState(false);
	const defaultLanguageFetcher = useFetcher();
	const revalidator = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const wrapperRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	const gridRef = useRef<any>(null);
	const keyColumnRef = useRef<HTMLDivElement>(null);
	const [wrapperBounds, setWrapperBounds] = useState({ width: 0, height: 0 });

	// AI Translation polling logic
	const aiTranslateId = searchParams.get('aiTranslateId');
	const terminalStates = ['terminated', 'errored', 'complete'];
	const shouldPoll = Boolean(
		aiTranslateId &&
			aiTranslateStatus &&
			!terminalStates.includes(aiTranslateStatus.status),
	);

	const aiTranslationPoller = useBackoffCallback(
		async () => {
			revalidator.revalidate();

			// Check if we should stop polling (success) or keep polling (throw error)
			if (
				aiTranslateStatus &&
				terminalStates.includes(aiTranslateStatus.status)
			) {
				// Terminal state reached - stop polling by returning success
				return { status: aiTranslateStatus };
			} else {
				// Not terminal yet - keep polling by throwing error
				throw new Error(
					`Translation still in progress: ${aiTranslateStatus?.status || 'unknown'}`,
				);
			}
		},
		shouldPoll,
		{
			numOfAttempts: 30, // Poll for up to 30 attempts
			startingDelay: 2000, // Start with 2 second delay
			timeMultiple: 1.5, // Gradually increase delay
			maxDelay: 10000, // Max 10 seconds delay
		},
	);

	// Show/hide AI translation progress dialog
	useEffect(() => {
		if (aiTranslateId && aiTranslationPoller.isExecuting) {
			setShowAiTranslationProgress(true);
		} else {
			setShowAiTranslationProgress(false);
			if (
				aiTranslateStatus &&
				terminalStates.includes(aiTranslateStatus.status)
			) {
				setSearchParams(prev => {
					prev.delete('aiTranslateId');
					return prev;
				});
			}
		}
	}, [aiTranslateId, aiTranslationPoller.isExecuting]);

	const translationKeys = Array.from(translations.keys()).sort();
	const currentDefaultLanguage =
		languages.find(lang => lang.default)?.locale || '';

	// Sort languages to show default first, then others alphabetically
	const sortedLanguages = [...languages].sort((a, b) => {
		if (a.default && !b.default) return -1;
		if (!a.default && b.default) return 1;
		return a.locale.localeCompare(b.locale);
	});

	useEffect(() => {
		if (wrapperRef.current) {
			const { height, width } = wrapperRef.current.getBoundingClientRect();
			setWrapperBounds({ width, height });
		}
	}, [wrapperRef.current]);

	// Sync scroll between header, key column and grid
	const handleGridScroll = ({
		scrollLeft,
		scrollTop,
	}: {
		scrollLeft: number;
		scrollTop: number;
	}) => {
		if (headerRef.current) {
			headerRef.current.scrollLeft = scrollLeft;
		}
		if (keyColumnRef.current) {
			keyColumnRef.current.scrollTop = scrollTop;
		}
	};

	return (
		<main className="flex h-[calc(100vh-70px)] flex-col">
			<div className="container mx-auto flex flex-1 flex-col py-8">
				<div className="flex flex-col">
					<div className="mb-8 flex items-center justify-between">
						<h1 className="text-3xl font-bold">Translations Management</h1>
						<div className="flex items-center gap-4">
							{activeVersion && (
								<div className="text-muted-foreground text-sm">
									Active Version:
									<span className="ml-2 text-xs">
										{activeVersion.description ?? `v${activeVersion.id}`}
									</span>
								</div>
							)}
							<Button asChild variant="outline">
								<Link to="/edge-cms/sections">Manage Sections</Link>
							</Button>
							<Button asChild variant="outline" size="sm">
								<Link to="/edge-cms/i18n/versions">Manage Versions</Link>
							</Button>
						</div>
					</div>
					<div className="mb-6 flex flex-wrap gap-4">
						<Form method="get" className="flex gap-2">
							<select
								name="section"
								defaultValue={sectionFilter || ''}
								className="border-input bg-background rounded-md border px-3 py-2 text-sm"
								onChange={e => e.target.form?.submit()}
							>
								<option value="">All sections</option>
								{sections.map(section => (
									<option key={section.name} value={section.name}>
										{section.name}
									</option>
								))}
							</select>
						</Form>

						<div className="flex items-center gap-2">
							<defaultLanguageFetcher.Form
								method="post"
								className="flex items-center gap-2"
							>
								<input
									type="hidden"
									name="intent"
									value="set-default-language"
								/>
								<Label
									htmlFor="defaultLanguage"
									className="text-sm font-medium whitespace-nowrap"
								>
									Default Language:
								</Label>
								<select
									id="defaultLanguage"
									name="locale"
									value={currentDefaultLanguage}
									onChange={e => e.target.form?.submit()}
									className="border-input bg-background rounded-md border px-3 py-2 text-sm"
								>
									<option value="">No default</option>
									{languages.map(language => (
										<option key={language.locale} value={language.locale}>
											{language.locale}
										</option>
									))}
								</select>
							</defaultLanguageFetcher.Form>
							<Button
								onClick={() => setShowAddLanguage(true)}
								variant="outline"
							>
								Add Language
							</Button>
						</div>

						<div className="ml-auto flex gap-2">
							<AiTranslateButton isAiAvailable={isAiAvailable} />
							<Button onClick={() => setShowAddTranslation(true)}>
								Add Translation
							</Button>
							<Button onClick={() => setShowImportJson(true)}>
								Import JSON
							</Button>
						</div>
					</div>
				</div>

				<AddLanguageDialog
					open={showAddLanguage}
					onOpenChange={setShowAddLanguage}
				/>

				<AddTranslationDialog
					open={showAddTranslation}
					onOpenChange={setShowAddTranslation}
					sections={sections}
				/>

				<ImportJsonDialog
					open={showImportJson}
					onOpenChange={setShowImportJson}
					languages={languages}
					sections={sections}
				/>

				<AiTranslationProgressDialog
					open={showAiTranslationProgress}
					onOpenChange={setShowAiTranslationProgress}
					aiTranslateStatus={aiTranslateStatus}
					aiTranslationPoller={aiTranslationPoller}
				/>

				<div className="flex flex-1 flex-col overflow-hidden rounded-lg border">
					{/* Sticky header */}
					<div className="bg-background sticky top-0 z-20 flex border-b">
						{/* Top-left corner cell */}
						<div className="bg-muted/50 z-30 w-[200px] min-w-[200px] flex-shrink-0 border-r p-4 font-medium">
							Key
						</div>

						{/* Scrollable header */}
						<div
							ref={headerRef}
							className="flex-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							onScroll={e => {
								// If header is scrolled manually, sync back to grid
								if (gridRef.current) {
									gridRef.current.scrollTo({
										scrollLeft: e.currentTarget.scrollLeft,
									});
								}
							}}
						>
							<div
								className="flex"
								style={{ width: `${200 + sortedLanguages.length * 200}px` }}
							>
								<div className="bg-muted/50 w-[200px] min-w-[200px] flex-shrink-0 border-r p-4 font-medium">
									Section
								</div>
								{sortedLanguages.map(lang => (
									<div
										key={lang.locale}
										className={`${lang.default ? 'bg-blue-100' : 'bg-muted/50'} w-[200px] min-w-[200px] flex-shrink-0 border-r p-4 font-medium`}
									>
										{lang.locale}
										{lang.default && ' (default)'}
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Main content area */}
					<div
						ref={wrapperRef}
						className="flex flex-1 overflow-hidden"
						style={{ overscrollBehavior: 'contain' }}
					>
						{/* Sticky key column */}
						<div className="bg-background w-[200px] flex-shrink-0 border-r">
							<div
								ref={keyColumnRef}
								className="overflow-x-hidden overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
								style={{ height: wrapperBounds.height }}
								onScroll={e => {
									// If key column is scrolled manually, sync back to grid
									if (gridRef.current) {
										gridRef.current.scrollTo({
											scrollTop: e.currentTarget.scrollTop,
										});
									}
								}}
							>
								{translationKeys.map(key => (
									<div
										key={key}
										className="flex h-[60px] w-[200px] items-center border-b p-4 font-mono text-sm"
									>
										<KeyCell translationKey={key} />
									</div>
								))}
							</div>
						</div>

						{/* Grid content (without key column) */}
						<div className="flex-1 overflow-hidden">
							{wrapperBounds.height > 0 && (
								<FixedSizeGrid
									ref={gridRef}
									height={wrapperBounds.height}
									columnCount={languages.length + 1} // +1 for section only
									rowCount={translationKeys.length} // No header row
									columnWidth={200}
									rowHeight={60}
									width={wrapperBounds.width - 200} // Subtract key column width
									onScroll={handleGridScroll}
									itemData={{
										translationKeys,
										translations,
										sortedLanguages,
										sections,
									}}
								>
									{VirtualizedCell}
								</FixedSizeGrid>
							)}
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
