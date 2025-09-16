import { useState, useEffect } from 'react';
import { useLoaderData, useNavigate, useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog';
import {
	ArrowLeft,
	Shield,
	ShieldOff,
	Key,
	Trash2,
	User as UserIcon,
	Mail,
	Calendar,
	Edit,
} from 'lucide-react';
import { useServerToast } from '~/hooks/use-server-toast';
import {
	createToastHeaders,
	redirectWithToast,
} from '~/utils/toast/toast.server';
import { combineHeaders } from '~/utils/misc';
import { requireAuth } from '~/utils/auth.middleware';
import { env } from 'cloudflare:workers';
import { APIError, type User } from 'better-auth/api';
import type { Route } from './+types/users.$id';

export async function loader({ request, params }: Route.LoaderArgs) {
	const { auth, user } = await requireAuth(request, env);
	const userId = params.id;

	try {
		// Get user details
		const users = await auth.api.listUsers({
			query: {},
			headers: request.headers,
		});

		const currentUser = users.users?.find((u: User) => u.id === userId);

		if (!currentUser) {
			throw new Response('User not found', { status: 404 });
		}

		return {
			user: currentUser,
			isCurrentUser: user.id === userId,
		};
	} catch (error) {
		return redirectWithToast('/edge-cms', {
			type: 'error',
			title: 'Error',
			description: error instanceof Error ? error.message : 'An error occurred',
		});
	}
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { auth } = await requireAuth(request, env);
	const formData = await request.formData();
	const action = formData.get('action');
	const userId = params.id;

	try {
		switch (action) {
			case 'set-role': {
				const newRole = formData.get('role') as 'admin' | 'user';

				await auth.api.setRole({
					body: {
						userId,
						role: newRole,
					},
					headers: request.headers,
				});

				const toastHeaders = await createToastHeaders({
					type: 'success',
					title: 'Role updated',
					description: `User role has been changed to ${newRole}.`,
				});
				return new Response(JSON.stringify({ success: true }), {
					headers: combineHeaders(toastHeaders, {
						'Content-Type': 'application/json',
					}),
				});
			}

			case 'set-password': {
				const newPassword = formData.get('password') as string;

				if (!newPassword || newPassword.length < 8) {
					const toastHeaders = await createToastHeaders({
						type: 'error',
						title: 'Invalid password',
						description: 'Password must be at least 8 characters long.',
					});
					return new Response(JSON.stringify({ success: false }), {
						headers: combineHeaders(toastHeaders, {
							'Content-Type': 'application/json',
						}),
					});
				}

				await auth.api.setUserPassword({
					body: {
						userId,
						newPassword,
					},
					headers: request.headers,
				});

				const toastHeaders = await createToastHeaders({
					type: 'success',
					title: 'Password updated',
					description: 'User password has been changed successfully.',
				});
				return new Response(JSON.stringify({ success: true }), {
					headers: combineHeaders(toastHeaders, {
						'Content-Type': 'application/json',
					}),
				});
			}

			case 'remove-user': {
				await auth.api.removeUser({
					body: {
						userId,
					},
					headers: request.headers,
				});

				return redirectWithToast('/edge-cms/users', {
					type: 'success',
					title: 'User deleted',
					description: 'User has been removed from the system.',
				});
			}

			default:
				return { success: false };
		}
	} catch (error) {
		const toastHeaders = await createToastHeaders({
			type: 'error',
			title: 'Operation failed',
			description: error instanceof Error ? error.message : 'An error occurred',
		});
		return new Response(JSON.stringify({ success: false }), {
			headers: combineHeaders(toastHeaders, {
				'Content-Type': 'application/json',
			}),
		});
	}
}

export default function UserDetailPage() {
	const { user, isCurrentUser } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [roleDialogOpen, setRoleDialogOpen] = useState(false);

	useServerToast();

	// Handle modal dismissal on successful form submissions
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success) {
			setPasswordDialogOpen(false);
			setRoleDialogOpen(false);
		}
	}, [fetcher.state, fetcher.data]);

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
		<div className="container mx-auto max-w-4xl py-8">
			<div className="mb-8">
				<Button
					variant="ghost"
					onClick={() => navigate('/edge-cms/users')}
					className="mb-4"
				>
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Users
				</Button>

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
							<UserIcon className="h-6 w-6" />
						</div>
						<div>
							<h1 className="text-3xl font-bold">
								{user.name || 'Unnamed User'}
							</h1>
							<p className="text-muted-foreground">{user.email}</p>
						</div>
					</div>
					{isCurrentUser && (
						<Badge variant="outline" className="text-sm">
							Your Account
						</Badge>
					)}
				</div>
			</div>

			<div className="space-y-6">
				{/* User Information Card */}
				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-lg font-semibold">User Information</h2>
					<div className="grid gap-4">
						<div className="grid grid-cols-3 gap-4">
							<div>
								<Label className="text-muted-foreground">User ID</Label>
								<p className="mt-1 font-mono text-sm">{user.id}</p>
							</div>
							<div>
								<Label className="text-muted-foreground">Email</Label>
								<p className="mt-1 flex items-center gap-2">
									<Mail className="text-muted-foreground h-4 w-4" />
									{user.email}
								</p>
							</div>
							<div>
								<Label className="text-muted-foreground">Name</Label>
								<p className="mt-1">{user.name || '-'}</p>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-4">
							<div>
								<Label className="text-muted-foreground">Created At</Label>
								<p className="mt-1 flex items-center gap-2">
									<Calendar className="text-muted-foreground h-4 w-4" />
									{formatDate(user.createdAt)}
								</p>
							</div>
							<div>
								<Label className="text-muted-foreground">Last Login</Label>
								<p className="mt-1 flex items-center gap-2">
									<Calendar className="text-muted-foreground h-4 w-4" />
									{formatDate(user.updatedAt)}
								</p>
							</div>
							<div>
								<Label className="text-muted-foreground">Email Verified</Label>
								<p className="mt-1">
									{user.emailVerified ? (
										<Badge variant="outline" className="bg-green-50">
											Verified
										</Badge>
									) : (
										<Badge variant="outline" className="bg-yellow-50">
											Not Verified
										</Badge>
									)}
								</p>
							</div>
						</div>
					</div>
				</div>

				{/* Roles Section */}
				<div className="rounded-lg border p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-lg font-semibold">Roles & Permissions</h2>
						<Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm">
									<Edit className="mr-2 h-4 w-4" />
									Edit Role
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Change User Role</DialogTitle>
									<DialogDescription>
										Select the new role for this user. Admin users have full
										system access.
									</DialogDescription>
								</DialogHeader>
								<fetcher.Form method="post">
									<input type="hidden" name="action" value="set-role" />
									<div className="grid gap-4 py-4">
										<div className="space-y-2">
											<div className="flex items-center space-x-2">
												<input
													type="radio"
													id="role-user"
													name="role"
													value="user"
													defaultChecked={user.role !== 'admin'}
													className="h-4 w-4"
												/>
												<Label
													htmlFor="role-user"
													className="flex cursor-pointer items-center gap-2"
												>
													<ShieldOff className="h-4 w-4" />
													User
													<span className="text-muted-foreground text-sm">
														- Standard access
													</span>
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<input
													type="radio"
													id="role-admin"
													name="role"
													value="admin"
													defaultChecked={user.role === 'admin'}
													className="h-4 w-4"
												/>
												<Label
													htmlFor="role-admin"
													className="flex cursor-pointer items-center gap-2"
												>
													<Shield className="h-4 w-4" />
													Admin
													<span className="text-muted-foreground text-sm">
														- Full system access
													</span>
												</Label>
											</div>
										</div>
									</div>
									<DialogFooter>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting ? 'Updating...' : 'Update Role'}
										</Button>
									</DialogFooter>
								</fetcher.Form>
							</DialogContent>
						</Dialog>
					</div>
					<div className="flex items-center gap-2">
						<Badge
							variant={user.role === 'admin' ? 'destructive' : 'default'}
							className="text-sm"
						>
							{user.role === 'admin' ? (
								<>
									<Shield className="mr-1 h-3 w-3" />
									Admin
								</>
							) : (
								<>
									<ShieldOff className="mr-1 h-3 w-3" />
									User
								</>
							)}
						</Badge>
					</div>
				</div>

				{/* Actions Section */}
				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-lg font-semibold">Account Actions</h2>
					<div className="flex gap-3">
						{/* Reset Password */}
						<Dialog
							open={passwordDialogOpen}
							onOpenChange={setPasswordDialogOpen}
						>
							<DialogTrigger asChild>
								<Button variant="outline">
									<Key className="mr-2 h-4 w-4" />
									Reset Password
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Reset User Password</DialogTitle>
									<DialogDescription>
										Enter a new password for {user.email}. The user will need to
										use this new password to sign in.
									</DialogDescription>
								</DialogHeader>
								<fetcher.Form method="post">
									<input type="hidden" name="action" value="set-password" />
									<div className="grid gap-4 py-4">
										<div className="grid grid-cols-4 items-center gap-4">
											<Label htmlFor="password" className="text-right">
												New Password
											</Label>
											<Input
												id="password"
												name="password"
												type="password"
												required
												minLength={8}
												className="col-span-3"
												placeholder="••••••••"
											/>
										</div>
										<p className="text-muted-foreground text-sm">
											Password must be at least 8 characters long.
										</p>
									</div>
									<DialogFooter>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting ? 'Updating...' : 'Update Password'}
										</Button>
									</DialogFooter>
								</fetcher.Form>
							</DialogContent>
						</Dialog>

						{/* Delete User */}
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="destructive">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete User
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
									<AlertDialogDescription>
										This action cannot be undone. This will permanently delete
										the user account for <strong>{user.email}</strong> and
										remove all associated data from the system.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<fetcher.Form method="post" className="inline">
										<input type="hidden" name="action" value="remove-user" />
										<AlertDialogAction asChild>
											<Button
												type="submit"
												variant="destructive"
												disabled={isSubmitting}
											>
												{isSubmitting ? 'Deleting...' : 'Delete User'}
											</Button>
										</AlertDialogAction>
									</fetcher.Form>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>
			</div>
		</div>
	);
}
