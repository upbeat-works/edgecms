import { useLoaderData, useSubmit, useFetcher } from 'react-router';
import {
	getVersions,
	releaseDraft,
	rollbackVersion,
	updateVersionDescription,
} from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { EmptyState } from '~/components/ui/empty-state';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table';
import { requireAuth } from '~/utils/auth.middleware';
import { env } from 'cloudflare:workers';
import { SmartTextarea } from './i18n/smart-textarea';
import { History, RotateCcw, Rocket } from 'lucide-react';

function DescriptionCell({
	versionId,
	description,
}: {
	versionId: number;
	description: string | null;
}) {
	const fetcher = useFetcher({ key: `update-description-${versionId}` });

	const handleSubmit = (value: string) => {
		if (value !== description) {
			fetcher.submit(
				{
					intent: 'update-description',
					versionId: versionId.toString(),
					description: value,
				},
				{ method: 'post' },
			);
		}
	};

	return (
		<SmartTextarea
			value={description || ''}
			onValueChange={() => {}}
			onSubmit={handleSubmit}
			placeholder="Enter description..."
			disabled={fetcher.state === 'submitting'}
			minHeight={32}
		/>
	);
}

export async function loader({ request }: { request: Request }) {
	await requireAuth(request, env);

	const [versions] = await Promise.all([getVersions()]);

	return { versions };
}

export async function action({ request }: { request: Request }) {
	const formData = await request.formData();
	const intent = formData.get('intent');

	if (intent === 'publish-version') {
		await releaseDraft();
		return { success: true };
	}

	if (intent === 'rollback-version') {
		const versionId = parseInt(formData.get('versionId') as string);
		await rollbackVersion(versionId);
		return { success: true };
	}

	if (intent === 'update-description') {
		const versionId = parseInt(formData.get('versionId') as string);
		const description = formData.get('description') as string;
		await updateVersionDescription(versionId, description);
		return { success: true };
	}

	return { success: false };
}

export default function VersionsPage() {
	const { versions } = useLoaderData<typeof loader>();
	const submit = useSubmit();

	const handlePublishVersion = (versionId: number) => {
		const formData = new FormData();
		formData.append('intent', 'publish-version');
		formData.append('versionId', versionId.toString());
		submit(formData, { method: 'post' });
	};

	const handleRollbackVersion = (versionId: number) => {
		const formData = new FormData();
		formData.append('intent', 'rollback-version');
		formData.append('versionId', versionId.toString());
		submit(formData, { method: 'post' });
	};

	return (
		<div className="container mx-auto px-4 py-4 lg:py-5">
			<WorkspacePageHeader
				density="compact"
				eyebrow="Release history"
				title="Versions"
				description="Review drafts, document releases, and restore an earlier version of your content."
			/>

			<div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5">
				<Table>
					<TableHeader className="bg-slate-50/80">
						<TableRow>
							<TableHead>Version</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Description</TableHead>
							<TableHead className="hidden md:table-cell">Created</TableHead>
							<TableHead className="hidden lg:table-cell">Created by</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{versions.map((version: any) => (
							<TableRow
								key={version.id}
								className="transition-colors hover:bg-sky-50/40"
							>
								<TableCell>
									<div className="flex items-center gap-2 font-semibold tabular-nums">
										<History className="h-4 w-4 text-sky-600" />v{version.id}
									</div>
								</TableCell>
								<TableCell>
									<Badge
										className={`h-5 border-0 capitalize shadow-none ${
											version.status === 'live'
												? 'bg-fuchsia-50 text-fuchsia-700'
												: version.status === 'draft'
													? 'bg-sky-50 text-sky-700'
													: 'bg-slate-100 text-slate-600'
										}`}
									>
										{version.status}
									</Badge>
								</TableCell>
								<TableCell>
									<DescriptionCell
										versionId={version.id}
										description={version.description}
									/>
								</TableCell>
								<TableCell className="hidden text-sm text-slate-600 md:table-cell">
									{new Date(version.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell className="hidden text-sm lg:table-cell">
									{version.createdBy || (
										<span className="text-muted-foreground">Unknown</span>
									)}
								</TableCell>
								<TableCell className="text-right">
									{version.status === 'draft' && (
										<Button
											onClick={() => handlePublishVersion(version.id)}
											size="sm"
											variant="brand"
										>
											<Rocket className="mr-2 h-4 w-4" />
											Publish
										</Button>
									)}
									{version.status === 'archived' && (
										<Button
											onClick={() => handleRollbackVersion(version.id)}
											size="sm"
											variant="outline"
										>
											<RotateCcw className="mr-2 h-4 w-4" />
											Rollback
										</Button>
									)}
									{version.status === 'live' && (
										<span className="text-muted-foreground text-sm font-medium">
											Current live
										</span>
									)}
								</TableCell>
							</TableRow>
						))}
						{versions.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="p-0">
									<EmptyState
										density="compact"
										title="No releases yet"
										description="Your release history will appear here after the first publish."
									/>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
