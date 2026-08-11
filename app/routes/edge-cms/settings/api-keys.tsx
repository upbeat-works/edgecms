import { useLoaderData, useFetcher } from 'react-router';
import { useState, useEffect } from 'react';
import { Check, Copy, Key, ShieldCheck, Terminal, Trash2 } from 'lucide-react';
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
import { WorkspacePageHeader } from '~/components/ui/workspace';
import { EmptyState } from '~/components/ui/empty-state';
import { Label } from '~/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogFooter,
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

	const result = await auth.api.listApiKeys({
		headers: request.headers,
	});

	const apiKeys: ApiKeyInfo[] = result.apiKeys.map(key => ({
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
			aria-label="Copy API key"
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
			<div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-500/20 dark:bg-amber-950/30">
				<p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
					Copy this key now. It won't be shown again.
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
					Create key
				</Button>
			</DialogTrigger>
			<DialogContent size="md">
				<DialogHeader>
					<DialogTitle>
						{newKey ? 'API key created' : 'Create API key'}
					</DialogTitle>
					{!newKey && (
						<DialogDescription>
							Create a credential for the EdgeCMS SDK or your deployment
							pipeline.
						</DialogDescription>
					)}
				</DialogHeader>

				{newKey ? (
					<NewKeyDisplay apiKey={newKey} onClose={handleClose} />
				) : (
					<fetcher.Form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="create-api-key" />
						<div className="space-y-2">
							<Label htmlFor="name">Key name (optional)</Label>
							<Input id="name" name="name" placeholder="Production deploy" />
							<p className="text-muted-foreground text-xs">
								Give your key a descriptive name to help you identify it later.
							</p>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={fetcher.state === 'submitting'}>
								{fetcher.state === 'submitting' ? 'Creating...' : 'Create key'}
							</Button>
						</DialogFooter>
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
					aria-label={`Delete ${keyName || 'API key'}`}
					className="text-destructive hover:text-destructive hover:bg-destructive/10"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete API key?</AlertDialogTitle>
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
						<AlertDialogAction type="submit">
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
			<div className="container mx-auto px-4 py-4 lg:py-5">
				<WorkspacePageHeader
					density="compact"
					eyebrow="Developer access"
					title="API keys"
					description="Create and revoke credentials used by the SDK and automated workflows."
					actions={<CreateApiKeyDialog />}
				/>

				<div className="mb-6 overflow-hidden rounded-xl bg-amber-100 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-amber-300/80">
					<div className="flex items-center justify-between border-b border-amber-300/80 px-4 py-3">
						<div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
							<Terminal className="h-3.5 w-3.5 text-sky-600" />
							Quick start
						</div>
						<ShieldCheck className="h-4 w-4 text-fuchsia-500" />
					</div>
					<div className="p-4">
						<p className="mb-3 text-sm text-slate-600">
							Use API keys to authenticate with the EdgeCMS SDK. Add your key to
							your project's{' '}
							<code className="rounded bg-sky-100 px-1 text-sky-700">
								edgecms.config.json
							</code>
							:
						</p>
						<pre className="overflow-x-auto rounded-lg bg-white p-3 font-mono text-sm text-slate-700 ring-1 ring-slate-200">
							{`{
  "apiKey": "\${EDGECMS_API_KEY}",
  ...
}`}
						</pre>
						<p className="mt-3 text-xs text-slate-500">
							Then set the{' '}
							<code className="rounded bg-sky-100 px-1 text-sky-700">
								EDGECMS_API_KEY
							</code>{' '}
							environment variable to your API key value.
						</p>
					</div>
				</div>

				<div className="bg-card overflow-hidden rounded-xl shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 dark:ring-white/10">
					<Table>
						<TableHeader className="bg-muted/45">
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Key</TableHead>
								<TableHead className="hidden md:table-cell">Created</TableHead>
								<TableHead>Last used</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{apiKeys.map(key => (
								<TableRow
									key={key.id}
									className="transition-colors hover:bg-sky-50/60 dark:hover:bg-sky-950/20"
								>
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
									<TableCell className="text-muted-foreground hidden text-sm md:table-cell">
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
									<TableCell colSpan={5} className="p-0">
										<EmptyState
											density="compact"
											title="Connect your first integration"
											description="Create an API key to use EdgeCMS from the SDK or an automated workflow."
											action={<CreateApiKeyDialog />}
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
