import { useLoaderData, Form, useFetcher } from 'react-router';
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { requireAuth } from '~/utils/auth.middleware';
import {
	getSectionsWithCounts,
	createSection,
	updateSection,
	deleteSection,
	type SectionWithCounts,
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
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { env } from 'cloudflare:workers';

export async function loader({ request }: { request: Request }) {
	await requireAuth(request, env);

	const sections = await getSectionsWithCounts();
	const languages = await getLanguages();

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
			// Reset to original value if empty
			setValue(sectionName);
			setIsDirty(false);
		}
	};

	return (
		<Input
			value={value}
			onChange={e => {
				setValue(e.target.value);
				setIsDirty(true);
			}}
			onBlur={handleBlur}
			className="h-auto border-0 p-1 font-medium focus:ring-1"
			placeholder="Section name..."
		/>
	);
}

export default function Sections() {
	const { sections, languages } = useLoaderData<typeof loader>();
	const [showAddSection, setShowAddSection] = useState(false);
	const addSectionFetcher = useFetcher();

	// Hide the form after successful submission
	useEffect(() => {
		if (addSectionFetcher.data?.success) {
			setShowAddSection(false);
		}
	}, [addSectionFetcher.data]);

	return (
		<main>
			<div className="container mx-auto py-8">
				<h1 className="mb-8 text-3xl font-bold">Sections Management</h1>

				<div className="mb-6 flex justify-end">
					<Dialog open={showAddSection} onOpenChange={setShowAddSection}>
						<DialogTrigger asChild>
							<Button>Add Section</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[425px]">
							<DialogHeader>
								<DialogTitle>Add New Section</DialogTitle>
							</DialogHeader>
							<addSectionFetcher.Form method="post" className="space-y-4">
								<input type="hidden" name="intent" value="add-section" />
								<div className="space-y-2">
									<Label htmlFor="name">Section Name</Label>
									<Input
										id="name"
										name="name"
										placeholder="e.g., homepage, dashboard"
										required
									/>
								</div>
								<div className="flex justify-end space-x-2">
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
											? 'Adding...'
											: 'Add'}
									</Button>
								</div>
							</addSectionFetcher.Form>
						</DialogContent>
					</Dialog>
				</div>

				{/* Sections Table */}
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Section Name</TableHead>
								<TableHead className="text-center">Media</TableHead>
								<TableHead className="text-center">Translations</TableHead>
								<TableHead className="w-[100px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sections.map(section => (
								<TableRow key={section.name}>
									<TableCell className="p-2">
										{section.name !== '-' ? (
											<EditableSectionName sectionName={section.name} />
										) : (
											<span className="text-muted-foreground px-2">
												{section.name}
											</span>
										)}
									</TableCell>
									<TableCell className="text-center">
										{section.mediaCount}
									</TableCell>
									<TableCell className="text-center">
										<div className="space-y-2">
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="cursor-help">
														{languages.length * section.translationKeysCount ===
														0
															? '0%'
															: Math.round(
																	(section.translationCount /
																		(languages.length *
																			section.translationKeysCount)) *
																		100,
																) + '%'}
													</div>
												</TooltipTrigger>
												<TooltipContent>
													{section.translationCount} /{' '}
													{languages.length * section.translationKeysCount}
												</TooltipContent>
											</Tooltip>
											<div className="mx-auto w-1/3">
												<Progress
													value={
														languages.length * section.translationKeysCount ===
														0
															? 0
															: (section.translationCount /
																	(languages.length *
																		section.translationKeysCount)) *
																100
													}
													className="w-full"
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
												onClick={e => {
													if (
														!confirm(
															`Are you sure you want to delete the section "${section.name}"? This will remove the section from all associated media and translations.`,
														)
													) {
														e.preventDefault();
													}
												}}
												className="text-destructive hover:text-destructive hover:bg-destructive/10"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</Form>
									</TableCell>
								</TableRow>
							))}
							{sections.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-muted-foreground py-8 text-center"
									>
										No sections created yet. Click "Add Section" to create your
										first section.
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
