import { useLoaderData, useFetcher } from 'react-router';
import { useState, useEffect } from 'react';
import { Trash2, Copy, Check, Key } from 'lucide-react';
import { requireAuth } from '~/utils/auth.middleware';
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogDescription,
} from '~/components/ui/dialog';
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
import { env } from 'cloudflare:workers';
import type { Route } from './+types/api-keys';

interface ApiKeyInfo {
	id: string;
	name: string | null;
	start: string | null;
	createdAt: Date;
	lastRequest: Date | null;
}

export async function loader({ request }: Route.LoaderArgs) {
	const { auth, user } = await requireAuth(request, env);

	// List API keys for the current user
	const result = await auth.api.listApiKeys({
		headers: request.headers,
	});

	const apiKeys: ApiKeyInfo[] = result.map(key => ({
		id: key.id,
		name: key.name,
		start: key.start,
		createdAt: key.createdAt,
		lastRequest: key.lastRequest,
	}));

	return { apiKeys, user };
}

export async function action({ request }: Route.ActionArgs) {
	const { auth } = await requireAuth(request, env);

	const formData = await request.formData();
	const intent = formData.get('intent');

	switch (intent) {
		case 'create-api-key': {
			const name = formData.get('name') as string;

			const result = await auth.api.createApiKey({
				body: {
					name: name || undefined,
				},
				headers: request.headers,
			});

			// Return the full key - this is the only time it will be shown
			return {
				success: true,
				newKey: result.key,
				keyId: result.id,
				keyName: result.name,
			};
		}

		case 'delete-api-key': {
			const keyId = formData.get('keyId') as string;

			await auth.api.deleteApiKey({
				body: { keyId },
				headers: request.headers,
			});

			return { success: true, deleted: keyId };
		}

		default:
			return { error: 'Invalid action' };
	}
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleCopy}
			className="h-8 w-8"
		>
			{copied ? (
				<Check className="h-4 w-4 text-green-500" />
			) : (
				<Copy className="h-4 w-4" />
			)}
		</Button>
	);
}

function NewKeyDisplay({
	apiKey,
	onClose,
}: {
	apiKey: string;
	onClose: () => void;
}) {
	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
				<p className="mb-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
					Make sure to copy your API key now. You won't be able to see it again!
				</p>
				<div className="flex items-center gap-2">
					<code className="bg-muted flex-1 rounded px-3 py-2 font-mono text-sm break-all">
						{apiKey}
					</code>
					<CopyButton text={apiKey} />
				</div>
			</div>
			<div className="flex justify-end">
				<Button onClick={onClose}>Done</Button>
			</div>
		</div>
	);
}

function CreateApiKeyDialog() {
	const [open, setOpen] = useState(false);
	const fetcher = useFetcher<typeof action>();
	const [newKey, setNewKey] = useState<string | null>(null);

	useEffect(() => {
		if (fetcher.data?.success && fetcher.data?.newKey) {
			setNewKey(fetcher.data.newKey);
		}
	}, [fetcher.data]);

	const handleClose = () => {
		setOpen(false);
		setNewKey(null);
	};

	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			handleClose();
		} else {
			setOpen(true);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button>
					<Key className="mr-2 h-4 w-4" />
					Create API Key
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>
						{newKey ? 'API Key Created' : 'Create New API Key'}
					</DialogTitle>
					{!newKey && (
						<DialogDescription>
							Create an API key to use with the EdgeCMS SDK.
						</DialogDescription>
					)}
				</DialogHeader>

				{newKey ? (
					<NewKeyDisplay apiKey={newKey} onClose={handleClose} />
				) : (
					<fetcher.Form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="create-api-key" />
						<div className="space-y-2">
							<Label htmlFor="name">Key Name (optional)</Label>
							<Input
								id="name"
								name="name"
								placeholder="e.g., Development, CI/CD, Production"
							/>
							<p className="text-muted-foreground text-xs">
								Give your key a descriptive name to help you identify it later.
							</p>
						</div>
						<div className="flex justify-end space-x-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={fetcher.state === 'submitting'}>
								{fetcher.state === 'submitting' ? 'Creating...' : 'Create'}
							</Button>
						</div>
					</fetcher.Form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function DeleteApiKeyButton({
	keyId,
	keyName,
}: {
	keyId: string;
	keyName: string | null;
}) {
	const fetcher = useFetcher();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-destructive hover:text-destructive hover:bg-destructive/10"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete API Key</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete the API key
						{keyName ? ` "${keyName}"` : ''}? This action cannot be undone. Any
						applications using this key will stop working.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<fetcher.Form method="post">
						<input type="hidden" name="intent" value="delete-api-key" />
						<input type="hidden" name="keyId" value={keyId} />
						<AlertDialogAction
							type="submit"
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{fetcher.state === 'submitting' ? 'Deleting...' : 'Delete'}
						</AlertDialogAction>
					</fetcher.Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function formatDate(date: Date | null): string {
	if (!date) return 'Never';
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export default function ApiKeysSettings() {
	const { apiKeys } = useLoaderData<typeof loader>();

	return (
		<main>
			<div className="container mx-auto py-8">
				<div className="mb-8 flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">API Keys</h1>
						<p className="text-muted-foreground mt-1">
							Manage API keys for the EdgeCMS SDK
						</p>
					</div>
					<CreateApiKeyDialog />
				</div>

				{/* Usage instructions */}
				<div className="bg-muted/50 mb-6 rounded-lg border p-4">
					<h2 className="mb-2 font-semibold">Quick Start</h2>
					<p className="text-muted-foreground mb-3 text-sm">
						Use API keys to authenticate with the EdgeCMS SDK. Add your key to
						your project's{' '}
						<code className="bg-muted rounded px-1">edgecms.config.json</code>:
					</p>
					<pre className="bg-muted overflow-x-auto rounded p-3 text-sm">
						{`{
  "apiKey": "\${EDGECMS_API_KEY}",
  ...
}`}
					</pre>
					<p className="text-muted-foreground mt-2 text-xs">
						Then set the{' '}
						<code className="bg-muted rounded px-1">EDGECMS_API_KEY</code>{' '}
						environment variable to your API key value.
					</p>
				</div>

				{/* API Keys Table */}
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Key</TableHead>
								<TableHead>Created</TableHead>
								<TableHead>Last Used</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{apiKeys.map(key => (
								<TableRow key={key.id}>
									<TableCell className="font-medium">
										{key.name || (
											<span className="text-muted-foreground italic">
												Unnamed
											</span>
										)}
									</TableCell>
									<TableCell>
										<code className="bg-muted rounded px-2 py-1 font-mono text-sm">
											{key.start}...
										</code>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatDate(key.createdAt)}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatDate(key.lastRequest)}
									</TableCell>
									<TableCell>
										<DeleteApiKeyButton keyId={key.id} keyName={key.name} />
									</TableCell>
								</TableRow>
							))}
							{apiKeys.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-muted-foreground py-12 text-center"
									>
										<Key className="mx-auto mb-3 h-8 w-8 opacity-50" />
										<p>No API keys created yet.</p>
										<p className="text-sm">
											Create an API key to start using the EdgeCMS SDK.
										</p>
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
