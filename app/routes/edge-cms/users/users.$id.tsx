import { useState, useEffect } from 'react';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { WorkspacePageHeader } from '~/components/ui/workspace';
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
	Shield,
	ShieldOff,
	Key,
	Trash2,
	Mail,
	Calendar,
	Edit,
	ShieldCheck,
} from 'lucide-react';
import { useServerToast } from '~/hooks/use-server-toast';
import {
	createToastHeaders,
	redirectWithToast,
} from '~/utils/toast/toast.server';
import { combineHeaders } from '~/utils/misc';
import { requireAuth } from '~/utils/auth.middleware';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/users.$id';

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

export async function loader({ request, params }: Route.LoaderArgs) {
	const { auth, user } = await requireAuth(request, env);
	const userId = params.id;

	try {
		const users = await auth.api.listUsers({
			query: {},
			headers: request.headers,
		});

		const currentUser = users.users?.find(u => u.id === userId);

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

export async function action({ request, params }: Route.ActionArgs) {
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
	const fetcher = useFetcher();
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [roleDialogOpen, setRoleDialogOpen] = useState(false);

	useServerToast();

	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success) {
			setPasswordDialogOpen(false);
			setRoleDialogOpen(false);
		}
	}, [fetcher.state, fetcher.data]);

	const isSubmitting = fetcher.state === 'submitting';

	return (
		<div className="container mx-auto px-4 py-4 lg:py-5">
			<WorkspacePageHeader
				density="compact"
				eyebrow={
					<>
						<Link
							to="/edge-cms/users"
							className="cursor-pointer uppercase transition-colors hover:text-sky-800 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
						>
							Users
						</Link>
						<span className="text-slate-300">/</span>
						<span className="uppercase">Account</span>
					</>
				}
				title={user.name || 'Unnamed user'}
				description={user.email}
				actions={
					isCurrentUser ? (
						<Badge className="border-0 bg-sky-50 px-3 py-1 text-sky-700 shadow-none">
							Your account
						</Badge>
					) : null
				}
			/>

			<div className="space-y-4">
				<section className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5">
					<div className="h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-fuchsia-500" />
					<div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start sm:p-6">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-fuchsia-100 text-base font-bold text-slate-700">
							{getInitials(user.name, user.email)}
						</div>
						<div className="grid min-w-0 flex-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
							<div>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Email
								</p>
								<p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium">
									<Mail className="h-4 w-4 shrink-0 text-sky-600" />
									<span className="truncate">{user.email}</span>
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Created
								</p>
								<p className="mt-1 flex items-center gap-2 text-sm font-medium">
									<Calendar className="h-4 w-4 text-sky-600" />
									{formatDate(user.createdAt)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Email status
								</p>
								<Badge
									className={
										user.emailVerified
											? 'mt-1 border-0 bg-sky-50 text-sky-700 shadow-none'
											: 'mt-1 border-0 bg-amber-50 text-amber-700 shadow-none'
									}
								>
									{user.emailVerified ? 'Verified' : 'Not verified'}
								</Badge>
							</div>
							<div>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Last active
								</p>
								<p className="mt-1 text-sm font-medium">
									{formatDate(user.updatedAt)}
								</p>
							</div>
							<div className="sm:col-span-2 lg:col-span-2">
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									User ID
								</p>
								<p className="mt-1 truncate font-mono text-xs text-slate-700">
									{user.id}
								</p>
							</div>
						</div>
					</div>
				</section>

				<section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 sm:p-6">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h2 className="font-semibold tracking-tight">
								Role and permissions
							</h2>
							<p className="text-muted-foreground mt-1 text-sm">
								Controls this user’s workspace access.
							</p>
						</div>
						<Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm">
									<Edit className="mr-2 h-4 w-4" />
									Edit role
								</Button>
							</DialogTrigger>
							<DialogContent size="sm">
								<DialogHeader>
									<DialogTitle>Change user role</DialogTitle>
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
										<Button
											type="button"
											variant="outline"
											onClick={() => setRoleDialogOpen(false)}
										>
											Cancel
										</Button>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting ? 'Updating...' : 'Update role'}
										</Button>
									</DialogFooter>
								</fetcher.Form>
							</DialogContent>
						</Dialog>
					</div>
					<div className="flex items-center gap-2">
						<Badge
							className={
								user.role === 'admin'
									? 'border-0 bg-fuchsia-50 px-3 py-1 text-fuchsia-700 shadow-none'
									: 'border-0 bg-sky-50 px-3 py-1 text-sky-700 shadow-none'
							}
						>
							{user.role === 'admin' ? (
								<>
									<ShieldCheck className="mr-1 h-3 w-3" />
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
				</section>

				<section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 sm:p-6">
					<div className="mb-4">
						<h2 className="font-semibold tracking-tight">Account actions</h2>
						<p className="text-muted-foreground mt-1 text-sm">
							Update credentials or remove access to this workspace.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Dialog
							open={passwordDialogOpen}
							onOpenChange={setPasswordDialogOpen}
						>
							<DialogTrigger asChild>
								<Button variant="outline">
									<Key className="mr-2 h-4 w-4" />
									Reset password
								</Button>
							</DialogTrigger>
							<DialogContent size="sm">
								<DialogHeader>
									<DialogTitle>Reset user password</DialogTitle>
									<DialogDescription>
										Enter a new password for {user.email}. The user will need to
										use this new password to sign in.
									</DialogDescription>
								</DialogHeader>
								<fetcher.Form method="post">
									<input type="hidden" name="action" value="set-password" />
									<div className="space-y-2 py-2">
										<div className="space-y-2">
											<Label htmlFor="password">New password</Label>
											<Input
												id="password"
												name="password"
												type="password"
												required
												minLength={8}
												placeholder="••••••••"
											/>
										</div>
										<p className="text-muted-foreground text-sm">
											Password must be at least 8 characters long.
										</p>
									</div>
									<DialogFooter>
										<Button
											type="button"
											variant="outline"
											onClick={() => setPasswordDialogOpen(false)}
										>
											Cancel
										</Button>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting ? 'Updating...' : 'Update password'}
										</Button>
									</DialogFooter>
								</fetcher.Form>
							</DialogContent>
						</Dialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="destructive">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete user
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete user?</AlertDialogTitle>
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
												{isSubmitting ? 'Deleting...' : 'Delete user'}
											</Button>
										</AlertDialogAction>
									</fetcher.Form>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</section>
			</div>
		</div>
	);
}
