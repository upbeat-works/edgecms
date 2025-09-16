import { useState, useEffect } from 'react';
import {
	useLoaderData,
	useNavigate,
	Form,
	useFetcher,
	redirect,
} from 'react-router';
import type { Route } from '../+types/users';
import { Button } from '~/components/ui/button';
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
import { Plus, Users } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { useServerToast } from '~/hooks/use-server-toast';
import {
	createToastHeaders,
	redirectWithToast,
} from '~/utils/toast/toast.server';
import { combineHeaders } from '~/utils/misc';
import { requireAuth } from '~/utils/auth.middleware';

export async function loader({ request, context }: Route.LoaderArgs) {
	const { auth, user } = await requireAuth(request, context.cloudflare.env);

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

export async function action({ request, context }: Route.ActionArgs) {
	const auth = createAuth(context.cloudflare.env);
	const formData = await request.formData();
	const action = formData.get('action');

	// Check if user is authenticated and is admin
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
					role: 'user', // Default role
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

export default function UsersPage() {
	const { users, currentUserId } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [dialogOpen, setDialogOpen] = useState(false);

	useServerToast();

	// Handle modal dismissal on successful form submissions
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success) {
			setDialogOpen(false);
		}
	}, [fetcher.state, fetcher.data]);

	const handleRowClick = (userId: string) => {
		navigate(`/edge-cms/users/${userId}`);
	};

	const formatDate = (date: string | number | null | undefined) => {
		if (!date) return 'Never';
		try {
			return new Date(date).toLocaleString();
		} catch {
			return 'Never';
		}
	};

	const isSubmitting = fetcher.state === 'submitting';

	return (
		<div className="container mx-auto py-8">
			<div className="mb-8 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Users className="h-6 w-6" />
					<h1 className="text-3xl font-bold">User Management</h1>
				</div>
				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							Create New User
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>Create New User</DialogTitle>
							<DialogDescription>
								Add a new user to the system. They will receive the default user
								role.
							</DialogDescription>
						</DialogHeader>
						<fetcher.Form method="post">
							<input type="hidden" name="action" value="create" />
							<div className="grid gap-4 py-4">
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="email" className="text-right">
										Email
									</Label>
									<Input
										id="email"
										name="email"
										type="email"
										required
										className="col-span-3"
										placeholder="user@example.com"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="name" className="text-right">
										Name
									</Label>
									<Input
										id="name"
										name="name"
										required
										className="col-span-3"
										placeholder="John Doe"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="password" className="text-right">
										Password
									</Label>
									<Input
										id="password"
										name="password"
										type="password"
										required
										className="col-span-3"
										placeholder="••••••••"
									/>
								</div>
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? 'Creating...' : 'Create User'}
								</Button>
							</DialogFooter>
						</fetcher.Form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>ID</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Last Logged In</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map(user => (
							<TableRow
								key={user.id}
								className="hover:bg-muted/50 cursor-pointer"
								onClick={() => handleRowClick(user.id)}
							>
								<TableCell className="font-mono text-xs">
									{user.id.slice(0, 8)}...
								</TableCell>
								<TableCell>{user.email}</TableCell>
								<TableCell>{user.name || '-'}</TableCell>
								<TableCell>
									<Badge
										variant={user.role === 'admin' ? 'destructive' : 'default'}
									>
										{user.role || 'user'}
									</Badge>
									{user.id === currentUserId && (
										<Badge variant="outline" className="ml-2">
											You
										</Badge>
									)}
								</TableCell>
								<TableCell>{formatDate(user.updatedAt)}</TableCell>
							</TableRow>
						))}
						{users.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-muted-foreground text-center"
								>
									No users found
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
