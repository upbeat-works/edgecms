import { useLoaderData, useSubmit } from 'react-router';
import { getVersions, releaseDraft, rollbackVersion } from '~/lib/db.server';
import { Button } from '~/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table';
import { requireAuth } from '~/lib/auth.middleware';
import { env } from 'cloudflare:workers';

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
		<div className="container mx-auto py-8">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="text-3xl font-bold">Version Management</h1>
			</div>

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Version</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Description</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Created By</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{versions.map((version: any) => (
							<TableRow key={version.id}>
								<TableCell className="font-medium">v{version.id}</TableCell>
								<TableCell>
									<span
										className={`rounded-full px-2 py-1 text-xs ${
											version.status === 'live'
												? 'bg-green-100 text-green-800'
												: version.status === 'draft'
													? 'bg-blue-100 text-blue-800'
													: 'bg-gray-100 text-gray-800'
										}`}
									>
										{version.status}
									</span>
								</TableCell>
								<TableCell>
									{version.description || (
										<span className="text-gray-400 italic">No description</span>
									)}
								</TableCell>
								<TableCell>
									{new Date(version.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell>
									{version.createdBy || (
										<span className="text-gray-400 italic">Unknown</span>
									)}
								</TableCell>
								<TableCell>
									{version.status === 'draft' && (
										<Button
											onClick={() => handlePublishVersion(version.id)}
											size="sm"
											className="bg-green-600 hover:bg-green-700"
										>
											Publish
										</Button>
									)}
									{version.status === 'archived' && (
										<Button
											onClick={() => handleRollbackVersion(version.id)}
											size="sm"
											variant="outline"
										>
											Rollback
										</Button>
									)}
									{version.status === 'live' && (
										<span className="text-sm text-gray-500">Current Live</span>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
