import {
	Link,
	Outlet,
	useLocation,
	useLoaderData,
	useFetcher,
	useSearchParams,
	useRevalidator,
} from 'react-router';
import { useState, useEffect } from 'react';
import { Key, Menu, Rocket, UserRound, Zap } from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import {
	Sheet,
	SheetContent,
	SheetTrigger,
	SheetTitle,
	SheetClose,
} from '~/components/ui/sheet';
import { requireAuth } from '~/utils/auth.middleware';
import { getLatestVersion, getReleaseInstance } from '~/utils/db.server';
import { useBackoffCallback } from '~/hooks/use-poll-exponential-backoff';
import { builtInNavItems, customNavItems } from '~/nav-items';
import { PublishProgressDialog } from './publish-progress-dialog';
import type { Route } from './+types/_layout';
import { env } from 'cloudflare:workers';

const PUBLISH_TERMINAL_STATES = ['terminated', 'errored', 'complete'];

function isActivePath(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export async function loader({ request }: Route.LoaderArgs) {
	const { user } = await requireAuth(request, env);
	const url = new URL(request.url);
	const publishId = url.searchParams.get('publishId');

	const [draftVersion, publishInstance] = await Promise.all([
		getLatestVersion('draft'),
		publishId ? getReleaseInstance(publishId) : Promise.resolve(null),
	]);

	const publishStatus = publishInstance ? await publishInstance.status() : null;

	return { user, draftVersion, publishStatus };
}

export default function Layout() {
	const { user, draftVersion, publishStatus } = useLoaderData<typeof loader>();
	const location = useLocation();
	const isCustomPage = location.pathname.startsWith('/edge-cms/custom');
	const publishFetcher = useFetcher<{ success: boolean; publishId: string }>();
	const revalidator = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const [showPublishProgress, setShowPublishProgress] = useState(false);
	const [mobileNavOpen, setMobileNavOpen] = useState(false);

	// When the publish action returns, push the instance id into the URL so the
	// loader can fetch its status and the dialog can survive page navigations.
	const fetcherPublishId = publishFetcher.data?.publishId;
	useEffect(() => {
		if (
			fetcherPublishId &&
			searchParams.get('publishId') !== fetcherPublishId
		) {
			setSearchParams(
				prev => {
					prev.set('publishId', fetcherPublishId);
					return prev;
				},
				{ replace: true },
			);
			setShowPublishProgress(true);
		}
	}, [fetcherPublishId]);

	const publishId = searchParams.get('publishId');
	const shouldPollPublish = Boolean(
		publishId &&
		publishStatus &&
		!PUBLISH_TERMINAL_STATES.includes(publishStatus.status),
	);

	const publishPoller = useBackoffCallback(
		async () => {
			await revalidator.revalidate();
			if (
				publishStatus &&
				PUBLISH_TERMINAL_STATES.includes(publishStatus.status)
			) {
				return { status: publishStatus };
			}
			throw new Error(
				`Publish still in progress: ${publishStatus?.status ?? 'unknown'}`,
			);
		},
		shouldPollPublish,
		{
			numOfAttempts: 30,
			startingDelay: 2000,
			timeMultiple: 1.5,
			maxDelay: 10000,
		},
	);

	// Show dialog while polling; on terminal state, leave the dialog open until
	// the user closes it (handler below clears the URL param).
	useEffect(() => {
		if (publishId && publishPoller.isExecuting) {
			setShowPublishProgress(true);
		}
	}, [publishId, publishPoller.isExecuting]);

	const handlePublishDialogChange = (open: boolean) => {
		setShowPublishProgress(open);
		if (!open && publishId) {
			setSearchParams(
				prev => {
					prev.delete('publishId');
					return prev;
				},
				{ replace: true },
			);
		}
	};

	useEffect(() => {
		setMobileNavOpen(false);
	}, [location.pathname]);

	return (
		<div className="bg-background min-h-screen">
			<header className="sticky top-0 z-40 border-b border-sky-100 bg-white/90 px-4 shadow-[0_1px_12px_rgb(14_165_233/0.06)] backdrop-blur-xl">
				<div className="container mx-auto">
					<nav className="flex h-16 items-center gap-4">
						<Link
							to="/edge-cms"
							className="group flex shrink-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
						>
							<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-600/25 transition-transform group-hover:-rotate-3">
								<Zap className="h-4.5 w-4.5 fill-current" />
							</span>
							<span className="text-base font-bold tracking-[-0.025em] text-slate-950">
								EdgeCMS
							</span>
						</Link>

						<div className="ml-3 hidden items-center gap-1 md:flex">
							{builtInNavItems.map(item => (
								<Link
									key={item.href}
									to={item.href}
									className={cn(
										'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
										isActivePath(location.pathname, item.href)
											? 'bg-sky-50 text-sky-700'
											: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
									)}
								>
									{item.label}
								</Link>
							))}
							{customNavItems.length > 0 && (
								<Separator orientation="vertical" className="mx-1 h-5" />
							)}
							{customNavItems.map(item => (
								<Link
									key={item.href}
									to={item.href}
									className={cn(
										'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
										isActivePath(location.pathname, item.href)
											? 'bg-fuchsia-50 text-fuchsia-700'
											: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
									)}
								>
									{item.label}
								</Link>
							))}
						</div>

						<div className="ml-auto flex items-center gap-2">
							{draftVersion && !isCustomPage && (
								<publishFetcher.Form method="post" action="/edge-cms/publish">
									<Button
										type="submit"
										size="sm"
										disabled={publishFetcher.state !== 'idle'}
										className="rounded-full bg-fuchsia-600 px-4 text-white shadow-md ring-2 shadow-fuchsia-600/25 ring-fuchsia-100 transition-all hover:-translate-y-px hover:bg-fuchsia-700 hover:shadow-lg hover:shadow-fuchsia-600/25"
									>
										<Rocket className="mr-2 h-3.5 w-3.5" />
										{publishFetcher.state !== 'idle'
											? 'Publishing...'
											: `Publish ${draftVersion.description ?? `v${draftVersion.id}`}`}
									</Button>
								</publishFetcher.Form>
							)}
							<Link
								to="/edge-cms/settings/api-keys"
								className={cn(
									'hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors lg:flex',
									isActivePath(location.pathname, '/edge-cms/settings/api-keys')
										? 'bg-sky-50 text-sky-700'
										: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
								)}
							>
								<Key className="h-4 w-4" />
								API keys
							</Link>
							{user.role === 'admin' && (
								<Link
									to="/edge-cms/users"
									className={cn(
										'hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors lg:flex',
										isActivePath(location.pathname, '/edge-cms/users')
											? 'bg-sky-50 text-sky-700'
											: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
									)}
								>
									<UserRound className="h-4 w-4" />
									Users
								</Link>
							)}

							<form
								action="/edge-cms/sign-out"
								method="post"
								className="hidden md:block"
							>
								<button
									type="submit"
									className="rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
								>
									Sign Out
								</button>
							</form>

							<Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
								<SheetTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="md:hidden"
										aria-label="Open menu"
									>
										<Menu className="h-5 w-5" />
									</Button>
								</SheetTrigger>
								<SheetContent side="right" className="w-72">
									<SheetTitle className="flex items-center gap-2.5">
										<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
											<Zap className="h-4 w-4 fill-current" />
										</span>
										EdgeCMS
									</SheetTitle>
									<nav className="mt-6 flex flex-col space-y-1">
										{builtInNavItems.map(item => (
											<SheetClose asChild key={item.href}>
												<Link
													to={item.href}
													className={cn(
														'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
														isActivePath(location.pathname, item.href)
															? 'bg-sky-50 text-sky-700'
															: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
													)}
												>
													{item.label}
												</Link>
											</SheetClose>
										))}
										{customNavItems.length > 0 && (
											<Separator className="my-2" />
										)}
										{customNavItems.map(item => (
											<SheetClose asChild key={item.href}>
												<Link
													to={item.href}
													className={cn(
														'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
														isActivePath(location.pathname, item.href)
															? 'bg-fuchsia-50 text-fuchsia-700'
															: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
													)}
												>
													{item.label}
												</Link>
											</SheetClose>
										))}
										<SheetClose asChild>
											<Link
												to="/edge-cms/settings/api-keys"
												className={cn(
													'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
													isActivePath(
														location.pathname,
														'/edge-cms/settings/api-keys',
													)
														? 'bg-sky-50 text-sky-700'
														: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
												)}
											>
												<Key className="h-4 w-4" />
												API keys
											</Link>
										</SheetClose>
										{user.role === 'admin' && (
											<SheetClose asChild>
												<Link
													to="/edge-cms/users"
													className={cn(
														'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
														isActivePath(location.pathname, '/edge-cms/users')
															? 'bg-sky-50 text-sky-700'
															: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
													)}
												>
													<UserRound className="h-4 w-4" />
													Users
												</Link>
											</SheetClose>
										)}
										<form
											action="/edge-cms/sign-out"
											method="post"
											className="pt-2"
										>
											<button
												type="submit"
												className="text-muted-foreground hover:bg-accent hover:text-foreground w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
											>
												Sign Out
											</button>
										</form>
									</nav>
								</SheetContent>
							</Sheet>
						</div>
					</nav>
				</div>
			</header>

			<main className="flex-1 px-4">
				<Outlet />
			</main>

			<PublishProgressDialog
				open={showPublishProgress}
				onOpenChange={handlePublishDialogChange}
				publishStatus={publishStatus as { status: string } | null}
			/>
		</div>
	);
}
