import { useState, useEffect } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogError,
	DialogHeader,
	DialogStatus,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '~/components/ui/dialog';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Progress } from '~/components/ui/progress';
import { Sparkles } from 'lucide-react';
import { useBackoffCallback } from '~/hooks/use-poll-exponential-backoff';
import type { Language, Section, TranslationScope } from '~/utils/db.server';

export function AddLanguageDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const addLanguageFetcher = useFetcher();

	useEffect(() => {
		if (addLanguageFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [addLanguageFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Add language</DialogTitle>
					<DialogDescription>
						Add a locale to this translation workspace.
					</DialogDescription>
				</DialogHeader>
				<addLanguageFetcher.Form method="post">
					<input type="hidden" name="intent" value="add-language" />
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="locale">Language code</Label>
							<Input
								id="locale"
								name="locale"
								placeholder="e.g., en, es, fr"
								required
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={addLanguageFetcher.state === 'submitting'}
						>
							{addLanguageFetcher.state === 'submitting'
								? 'Adding...'
								: 'Add language'}
						</Button>
					</DialogFooter>
				</addLanguageFetcher.Form>
			</DialogContent>
		</Dialog>
	);
}

export function DeleteLanguageDialog({
	open,
	onOpenChange,
	languages,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	languages: Language[];
}) {
	const deleteLanguageFetcher = useFetcher();
	const deletableLanguages = languages.filter(language => !language.default);

	useEffect(() => {
		if (deleteLanguageFetcher.data?.locale) {
			onOpenChange(false);
		}
	}, [deleteLanguageFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Delete language</DialogTitle>
					<DialogDescription>
						This removes the locale and all of its translations from the draft.
						The default language cannot be deleted.
					</DialogDescription>
				</DialogHeader>
				<deleteLanguageFetcher.Form method="post">
					<input type="hidden" name="intent" value="delete-language" />
					<div className="grid gap-2 py-4">
						<Label htmlFor="deleteLocale">Language</Label>
						<select
							id="deleteLocale"
							name="locale"
							className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
							required
						>
							{deletableLanguages.map(language => (
								<option key={language.locale} value={language.locale}>
									{language.locale}
								</option>
							))}
						</select>
						{deleteLanguageFetcher.data?.error && (
							<DialogError>{deleteLanguageFetcher.data.error}</DialogError>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={deleteLanguageFetcher.state !== 'idle'}
						>
							{deleteLanguageFetcher.state !== 'idle'
								? 'Deleting...'
								: 'Delete language'}
						</Button>
					</DialogFooter>
				</deleteLanguageFetcher.Form>
			</DialogContent>
		</Dialog>
	);
}

export function AddTranslationDialog({
	open,
	onOpenChange,
	sections,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sections: Section[];
}) {
	const addTranslationFetcher = useFetcher();

	useEffect(() => {
		if (addTranslationFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [addTranslationFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Add translation</DialogTitle>
					<DialogDescription>
						Create a key across every configured language.
					</DialogDescription>
				</DialogHeader>
				<addTranslationFetcher.Form method="post">
					<input type="hidden" name="intent" value="add-translation" />
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="key">Translation key</Label>
							<Input
								id="key"
								name="key"
								placeholder="e.g., welcome.title"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="section">Section (optional)</Label>
							<select
								id="section"
								name="section"
								className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
							>
								<option value="">-</option>
								{sections.map(section => (
									<option key={section.name} value={section.name}>
										{section.name}
									</option>
								))}
							</select>
						</div>
						{addTranslationFetcher.data?.error && (
							<DialogError>{addTranslationFetcher.data.error}</DialogError>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={addTranslationFetcher.state === 'submitting'}
						>
							{addTranslationFetcher.state === 'submitting'
								? 'Adding...'
								: 'Add translation'}
						</Button>
					</DialogFooter>
				</addTranslationFetcher.Form>
			</DialogContent>
		</Dialog>
	);
}

export function ImportJsonDialog({
	open,
	onOpenChange,
	languages,
	sections,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	languages: Language[];
	sections: Section[];
}) {
	const importJsonFetcher = useFetcher();

	useEffect(() => {
		if (importJsonFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [importJsonFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Import JSON translations</DialogTitle>
					<DialogDescription>
						Import translation values into one language and section.
					</DialogDescription>
				</DialogHeader>
				<importJsonFetcher.Form method="post" encType="multipart/form-data">
					<input type="hidden" name="intent" value="import-json" />
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="language">Language</Label>
							<select
								id="language"
								name="language"
								className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
								required
							>
								<option value="">Select language</option>
								{languages.map(lang => (
									<option key={lang.locale} value={lang.locale}>
										{lang.locale}
										{lang.default && ' (default)'}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="section">Section (optional)</Label>
							<select
								id="section"
								name="section"
								className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
							>
								<option value="">-</option>
								{sections.map(section => (
									<option key={section.name} value={section.name}>
										{section.name}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="jsonFile">JSON file</Label>
							<Input
								id="jsonFile"
								name="jsonFile"
								type="file"
								accept=".json"
								required
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={importJsonFetcher.state === 'submitting'}
						>
							{importJsonFetcher.state === 'submitting'
								? 'Importing...'
								: 'Import'}
						</Button>
					</DialogFooter>
				</importJsonFetcher.Form>
			</DialogContent>
		</Dialog>
	);
}

export function AiTranslateButton({
	isAiAvailable,
}: {
	isAiAvailable: boolean;
}) {
	const aiTranslateFetcher = useFetcher();

	const translate = (scope: TranslationScope) => {
		aiTranslateFetcher.submit(
			{ intent: 'ai-translate', scope },
			{ method: 'post' },
		);
	};

	return (
		<>
			{isAiAvailable ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							disabled={aiTranslateFetcher.state === 'submitting'}
							variant="outline"
							size="sm"
							className="h-9 border-fuchsia-200 px-3 text-fuchsia-700 hover:bg-fuchsia-50 hover:text-fuchsia-800"
						>
							<Sparkles className="size-4" />
							{aiTranslateFetcher.state === 'submitting'
								? 'Translating...'
								: 'AI Translate'}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-w-xs">
						<DropdownMenuItem onClick={() => translate('missing')}>
							<div>
								<div>Untranslated keys</div>
								<div className="text-muted-foreground text-xs">
									Fill in what each locale is missing
								</div>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => translate('missing-and-stale')}>
							<div>
								<div>Untranslated and outdated keys</div>
								<div className="text-muted-foreground text-xs">
									Also rewrite translations whose source text has changed,
									replacing what is there
								</div>
							</div>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								type="button"
								disabled={true}
								variant="outline"
								size="sm"
								className="h-9 cursor-not-allowed border-fuchsia-100 px-3 text-fuchsia-400"
							>
								<Sparkles className="size-4" />
								AI Translate
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>Set up an OpenAI API key to enable AI translations</p>
					</TooltipContent>
				</Tooltip>
			)}
		</>
	);
}

export function AiTranslationProgressDialog({
	open,
	onOpenChange,
	aiTranslateStatus,
	aiTranslationPoller,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	aiTranslateStatus: any;
	aiTranslationPoller: ReturnType<typeof useBackoffCallback>;
}) {
	const terminalStates = ['terminated', 'errored', 'complete'];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>AI translation in progress</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="text-muted-foreground text-sm">
						{aiTranslateStatus && (
							<span>Status: {aiTranslateStatus.status}</span>
						)}
					</div>
					<Progress
						indeterminate={aiTranslationPoller.isExecuting}
						value={100}
						className="w-full"
					/>
					{aiTranslateStatus &&
						terminalStates.includes(aiTranslateStatus.status) &&
						(aiTranslateStatus.status === 'complete' ? (
							<DialogStatus tone="success">
								Translation completed successfully
							</DialogStatus>
						) : aiTranslateStatus.status === 'errored' ? (
							<DialogStatus tone="danger">Translation failed</DialogStatus>
						) : (
							<DialogStatus tone="warning">
								Translation {aiTranslateStatus.status}
							</DialogStatus>
						))}
				</div>
				<DialogFooter>
					{aiTranslateStatus &&
					terminalStates.includes(aiTranslateStatus.status) ? (
						<Button onClick={() => onOpenChange(false)}>Close</Button>
					) : (
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Hide progress
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
