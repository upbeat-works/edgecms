import { useState, useEffect } from 'react';
import { useLoaderData, useNavigate, useFetcher } from 'react-router';
import type { Route } from './+types/users';
import { Button } from '~/components/ui/button';
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { createAuth } from '~/utils/auth.server';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { useServerToast } from '~/hooks/use-server-toast';
import {
	createToastHeaders,
	redirectWithToast,
} from '~/utils/toast/toast.server';
import { combineHeaders } from '~/utils/misc';
import { requireAuth } from '~/utils/auth.middleware';
import { env } from 'cloudflare:workers';

export async function loader({ request }: Route.LoaderArgs) {
	const { auth, user } = await requireAuth(request, env);

	try {
		const users = await auth.api.listUsers({
			headers: request.headers,
			query: {},
		});
		return { users: users.users || [], currentUserId: user.id };
	} catch (error) {
		return redirectWithToast('/edge-cms', {
			type: 'error',
			title: 'Error',
			description: error instanceof Error ? error.message : 'An error occurred',
		});
	}
}

export async function action({ request }: Route.ActionArgs) {
	const auth = createAuth(env);
	const formData = await request.formData();
	const action = formData.get('action');

	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (action === 'create') {
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const name = formData.get('name') as string;

		try {
			await auth.api.createUser({
				body: {
					email,
					password,
					name,
					role: 'user',
				},
				headers: request.headers,
			});

			const toastHeaders = await createToastHeaders({
				type: 'success',
				title: 'User created',
				description: `User ${email} has been created successfully.`,
			});
			return new Response(JSON.stringify({ success: true }), {
				headers: combineHeaders(toastHeaders, {
					'Content-Type': 'application/json',
				}),
			});
		} catch (error) {
			const toastHeaders = await createToastHeaders({
				type: 'error',
				title: 'Failed to create user',
				description:
					error instanceof Error ? error.message : 'An error occurred',
			});
			return new Response(JSON.stringify({ success: false }), {
				headers: combineHeaders(toastHeaders, {
					'Content-Type': 'application/json',
				}),
			});
		}
	}

	return { success: false };
}

function formatDate(date: string | number | Date | null | undefined) {
	if (!date) return 'Never';
	try {
		return new Date(date).toLocaleString();
	} catch {
		return 'Never';
	}
}

function getInitials(name: string | null | undefined, email: string) {
	const source = name?.trim() || email;
	return source
		.split(/[\s@._-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map(part => part[0]?.toUpperCase())
		.join('');
}

export default function UsersPage() {
	const { users, currentUserId } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [dialogOpen, setDialogOpen] = useState(false);

	useServerToast();

	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success) {
			setDialogOpen(false);
		}
	}, [fetcher.state, fetcher.data]);

	const handleRowClick = (userId: string) => {
		navigate(`/edge-cms/users/${userId}`);
	};

	const isSubmitting = fetcher.state === 'submitting';

	return (
		<div className="container mx-auto px-4 py-4 lg:py-5">
			<WorkspacePageHeader
				density="compact"
				eyebrow="Workspace access"
				title="Users"
				description="Manage who can access and edit this EdgeCMS workspace."
				actions={
					<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
						<DialogTrigger asChild>
							<Button variant="brand">
								<UserPlus className="mr-2 h-4 w-4" />
								Add user
							</Button>
						</DialogTrigger>
						<DialogContent size="sm">
							<DialogHeader>
								<DialogTitle>Add user</DialogTitle>
								<DialogDescription>
									Create credentials for someone who needs access to this
									workspace.
								</DialogDescription>
							</DialogHeader>
							<fetcher.Form method="post">
								<input type="hidden" name="action" value="create" />
								<div className="grid gap-4 py-5">
									<div className="space-y-2">
										<Label htmlFor="email">Email</Label>
										<Input
											id="email"
											name="email"
											type="email"
											required
											placeholder="user@example.com"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="name">Name</Label>
										<Input id="name" name="name" required placeholder="Name" />
									</div>
									<div className="space-y-2">
										<Label htmlFor="password">Password</Label>
										<Input
											id="password"
											name="password"
											type="password"
											required
											placeholder="••••••••"
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => setDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button type="submit" variant="brand" disabled={isSubmitting}>
										{isSubmitting ? 'Adding...' : 'Add user'}
									</Button>
								</DialogFooter>
							</fetcher.Form>
						</DialogContent>
					</Dialog>
				}
			/>

			<div className="bg-card overflow-hidden rounded-xl shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 dark:ring-white/10">
				<Table>
					<TableHeader className="bg-muted/45">
						<TableRow>
							<TableHead>Person</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead className="hidden lg:table-cell">User ID</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map(user => (
							<TableRow
								key={user.id}
								className="cursor-pointer transition-colors hover:bg-sky-50/60 dark:hover:bg-sky-950/20"
								onClick={() => handleRowClick(user.id)}
							>
								<TableCell>
									<div className="flex items-center gap-3">
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-fuchsia-100 text-xs font-bold text-slate-700 dark:from-sky-950 dark:to-fuchsia-950 dark:text-slate-200">
											{getInitials(user.name, user.email)}
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold">
												{user.name || 'Unnamed user'}
											</p>
											<p className="text-muted-foreground truncate text-xs">
												{user.email}
											</p>
										</div>
									</div>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<Badge
											className={
												user.role === 'admin'
													? 'h-5 border-0 bg-fuchsia-50 text-fuchsia-700 shadow-none'
													: 'h-5 border-0 bg-sky-50 text-sky-700 shadow-none'
											}
										>
											{user.role === 'admin' && (
												<ShieldCheck className="mr-1 h-3 w-3" />
											)}
											{user.role || 'user'}
										</Badge>
										{user.id === currentUserId && (
											<Badge variant="outline" className="h-5 text-[10px]">
												You
											</Badge>
										)}
									</div>
								</TableCell>
								<TableCell>{formatDate(user.updatedAt)}</TableCell>
								<TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
									{user.id.slice(0, 8)}…
								</TableCell>
							</TableRow>
						))}
						{users.length === 0 && (
							<TableRow>
								<TableCell colSpan={4} className="p-0">
									<EmptyState
										density="compact"
										title="Invite your team"
										description="Add someone who needs access to this EdgeCMS workspace."
										action={
											<Button
												variant="brand"
												size="sm"
												onClick={() => setDialogOpen(true)}
											>
												<UserPlus className="mr-2 h-4 w-4" />
												Add user
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
	);
}
