import { useState, useEffect } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '~/components/ui/dialog';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip';
import { Progress } from '~/components/ui/progress';
import { useBackoffCallback } from '~/hooks/use-poll-exponential-backoff';
import type { Language, Section } from '~/lib/db.server';

export function AddLanguageDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const addLanguageFetcher = useFetcher();

	// Hide the form after successful submission
	useEffect(() => {
		if (addLanguageFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [addLanguageFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add New Language</DialogTitle>
				</DialogHeader>
				<addLanguageFetcher.Form method="post">
					<input type="hidden" name="intent" value="add-language" />
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="locale">Language Code</Label>
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
								: 'Add Language'}
						</Button>
					</DialogFooter>
				</addLanguageFetcher.Form>
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

	// Hide the form after successful submission
	useEffect(() => {
		if (addTranslationFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [addTranslationFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add New Translation</DialogTitle>
				</DialogHeader>
				<addTranslationFetcher.Form method="post">
					<input type="hidden" name="intent" value="add-translation" />
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="key">Translation Key</Label>
							<Input
								id="key"
								name="key"
								placeholder="e.g., welcome.title"
								required
							/>
						</div>
						<div>
							<Label htmlFor="section">Section (optional)</Label>
							<select
								id="section"
								name="section"
								className="border-input bg-background h-10 rounded-md border px-3 py-2 text-sm"
							>
								<option value="">-</option>
								{sections.map(section => (
									<option key={section.name} value={section.name}>
										{section.name}
									</option>
								))}
							</select>
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
							disabled={addTranslationFetcher.state === 'submitting'}
						>
							{addTranslationFetcher.state === 'submitting'
								? 'Adding...'
								: 'Add Translation'}
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

	// Hide the form after successful submission
	useEffect(() => {
		if (importJsonFetcher.data?.success) {
			onOpenChange(false);
		}
	}, [importJsonFetcher.data, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Import JSON Translations</DialogTitle>
				</DialogHeader>
				<importJsonFetcher.Form method="post" encType="multipart/form-data">
					<input type="hidden" name="intent" value="import-json" />
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="language">Language</Label>
							<select
								id="language"
								name="language"
								className="border-input bg-background h-10 rounded-md border px-3 py-2 text-sm"
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
						<div>
							<Label htmlFor="section">Section (optional)</Label>
							<select
								id="section"
								name="section"
								className="border-input bg-background h-10 rounded-md border px-3 py-2 text-sm"
							>
								<option value="">-</option>
								{sections.map(section => (
									<option key={section.name} value={section.name}>
										{section.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<Label htmlFor="jsonFile">JSON File</Label>
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

	return (
		<aiTranslateFetcher.Form method="post">
			<input type="hidden" name="intent" value="ai-translate" />
			{isAiAvailable ? (
				<Button
					type="submit"
					disabled={aiTranslateFetcher.state === 'submitting'}
					variant="outline"
				>
					{aiTranslateFetcher.state === 'submitting'
						? 'Translating...'
						: 'AI Translate'}
				</Button>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								type="button"
								disabled={true}
								variant="outline"
								className="cursor-not-allowed"
							>
								AI Translate
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>Set up an OpenAI API key to enable AI translations</p>
					</TooltipContent>
				</Tooltip>
			)}
		</aiTranslateFetcher.Form>
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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>AI Translation in Progress</DialogTitle>
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
						terminalStates.includes(aiTranslateStatus.status) && (
							<div className="text-sm">
								{aiTranslateStatus.status === 'complete' ? (
									<span className="text-green-600">
										✅ Translation completed successfully!
									</span>
								) : aiTranslateStatus.status === 'errored' ? (
									<span className="text-red-600">❌ Translation failed</span>
								) : (
									<span className="text-yellow-600">
										⚠️ Translation {aiTranslateStatus.status}
									</span>
								)}
							</div>
						)}
				</div>
				<DialogFooter>
					{aiTranslateStatus &&
					terminalStates.includes(aiTranslateStatus.status) ? (
						<Button onClick={() => onOpenChange(false)}>Close</Button>
					) : (
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Hide Progress
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
