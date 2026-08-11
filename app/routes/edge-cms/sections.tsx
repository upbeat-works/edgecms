import { useLoaderData, Form, useFetcher } from 'react-router';
import { useState, useEffect } from 'react';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getSectionsWithCounts,
	createSection,
	updateSection,
	deleteSection,
	getLanguages,
} from '~/utils/db.server';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { EmptyState } from '~/components/ui/empty-state';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from '~/components/ui/tooltip';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { env } from 'cloudflare:workers';

export async function loader({ request }: { request: Request }) {
	await requireAuth(request, env);

	const [sections, languages] = await Promise.all([
		getSectionsWithCounts(),
		getLanguages(),
	]);

	return { sections, languages };
}

export async function action({ request }: { request: Request }) {
	await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	switch (intent) {
		case 'add-section': {
			const name = formData.get('name') as string;
			await createSection(name);
			return { success: true };
		}

		case 'update-section': {
			const oldName = formData.get('oldName') as string;
			const newName = formData.get('newName') as string;
			await updateSection(oldName, newName);
			return { success: true };
		}

		case 'delete-section': {
			const name = formData.get('name') as string;
			await deleteSection(name);
			return { success: true };
		}

		default:
			return { error: 'Invalid action' };
	}
}

function EditableSectionName({ sectionName }: { sectionName: string }) {
	const fetcher = useFetcher();
	const [value, setValue] = useState(sectionName);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setValue(sectionName);
		setIsDirty(false);
	}, [sectionName]);

	const handleBlur = () => {
		if (isDirty && value !== sectionName && value.trim() !== '') {
			fetcher.submit(
				{
					intent: 'update-section',
					oldName: sectionName,
					newName: value.trim(),
				},
				{ method: 'post' },
			);
		} else if (value.trim() === '') {
			setValue(sectionName);
			setIsDirty(false);
		}
	};

	return (
		<Input
			aria-label={`Rename ${sectionName}`}
			value={value}
			onChange={event => {
				setValue(event.target.value);
				setIsDirty(true);
			}}
			onBlur={handleBlur}
			className="hover:bg-muted/60 h-auto border-0 bg-transparent px-2 py-1.5 font-semibold tracking-tight shadow-none transition-colors focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-sky-500"
			placeholder="Section name"
		/>
	);
}

export default function Sections() {
	const { sections, languages } = useLoaderData<typeof loader>();
	const [showAddSection, setShowAddSection] = useState(false);
	const addSectionFetcher = useFetcher();

	useEffect(() => {
		if (addSectionFetcher.data?.success) {
			setShowAddSection(false);
		}
	}, [addSectionFetcher.data]);

	return (
		<main>
			<div className="container mx-auto px-4 py-4 lg:py-5">
				<WorkspacePageHeader
					density="compact"
					eyebrow="Content structure"
					title="Sections"
					description="Group related translations and media into clear areas of your site."
					actions={
						<Dialog open={showAddSection} onOpenChange={setShowAddSection}>
							<DialogTrigger asChild>
								<Button>
									<Plus className="mr-2 h-4 w-4" />
									New section
								</Button>
							</DialogTrigger>
							<DialogContent size="sm">
								<DialogHeader>
									<DialogTitle>New section</DialogTitle>
								</DialogHeader>
								<addSectionFetcher.Form method="post" className="space-y-4">
									<input type="hidden" name="intent" value="add-section" />
									<div className="space-y-2">
										<Label htmlFor="name">Section name</Label>
										<Input
											id="name"
											name="name"
											placeholder="Homepage"
											required
										/>
									</div>
									<DialogFooter>
										<Button
											type="button"
											variant="outline"
											onClick={() => setShowAddSection(false)}
										>
											Cancel
										</Button>
										<Button
											type="submit"
											disabled={addSectionFetcher.state === 'submitting'}
										>
											{addSectionFetcher.state === 'submitting'
												? 'Creating...'
												: 'Create section'}
										</Button>
									</DialogFooter>
								</addSectionFetcher.Form>
							</DialogContent>
						</Dialog>
					}
				/>

				<div className="bg-card overflow-hidden rounded-xl shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5">
					<Table>
						<TableHeader className="bg-muted/45">
							<TableRow>
								<TableHead>Section</TableHead>
								<TableHead className="text-center">Media</TableHead>
								<TableHead className="w-[38%]">Translation coverage</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sections.map(section => {
								const translationTotal =
									languages.length * section.translationKeysCount;
								const translationPercentage =
									translationTotal === 0
										? 0
										: Math.round(
												(section.translationCount / translationTotal) * 100,
											);

								return (
									<TableRow
										key={section.name}
										className="transition-colors hover:bg-sky-50/60"
									>
										<TableCell className="p-2">
											<div className="flex items-center gap-2">
												<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
													<FolderTree className="h-4 w-4" />
												</span>
												{section.name !== '-' ? (
													<EditableSectionName sectionName={section.name} />
												) : (
													<span className="text-muted-foreground px-2 text-sm font-medium">
														Unsorted
													</span>
												)}
											</div>
										</TableCell>
										<TableCell className="text-center text-sm font-semibold tabular-nums">
											<span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
												{section.mediaCount}
											</span>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-3">
												<Tooltip>
													<TooltipTrigger asChild>
														<div className="w-11 shrink-0 cursor-help text-right text-sm font-semibold tabular-nums">
															{translationPercentage}%
														</div>
													</TooltipTrigger>
													<TooltipContent>
														{section.translationCount} / {translationTotal}
													</TooltipContent>
												</Tooltip>
												<div className="min-w-20 flex-1">
													<Progress
														value={translationPercentage}
														className="h-1.5 w-full"
													/>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Form method="post" className="inline">
												<input
													type="hidden"
													name="intent"
													value="delete-section"
												/>
												<input type="hidden" name="name" value={section.name} />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													aria-label={`Delete ${section.name === '-' ? 'unsorted section' : section.name}`}
													onClick={event => {
														if (
															!confirm(
																`Are you sure you want to delete the section "${section.name}"? This will remove the section from all associated media and translations.`,
															)
														) {
															event.preventDefault();
														}
													}}
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</Form>
										</TableCell>
									</TableRow>
								);
							})}
							{sections.length === 0 && (
								<TableRow>
									<TableCell colSpan={4} className="p-0">
										<EmptyState
											density="compact"
											title="Create your first section"
											description="Group translations and media into a clear area of your site."
											action={
												<Button
													size="sm"
													onClick={() => setShowAddSection(true)}
												>
													<Plus className="mr-2 h-4 w-4" />
													New section
												</Button>
											}
										/>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</main>
	);
}
