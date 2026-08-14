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
import { Key, Rocket, UserRound, Zap } from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { requireAuth } from '~/utils/auth.middleware';
import { getLatestVersion, getReleaseInstance } from '~/utils/db.server';
import { useBackoffCallback } from '~/hooks/use-poll-exponential-backoff';
import { builtInNavItems, customNavItems } from '~/nav-items';
import { PublishProgressDialog } from './publish-progress-dialog';
import { MobileNavigation } from './mobile-navigation';
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
	const publishFetcher = useFetcher();
	const revalidator = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const [showPublishProgress, setShowPublishProgress] = useState(false);

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

	useEffect(() => {
		if (publishId) setShowPublishProgress(true);
	}, [publishId]);

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
									<input
										type="hidden"
										name="returnTo"
										value={`${location.pathname}${location.search}`}
									/>
									<Button
										type="submit"
										size="sm"
										disabled={publishFetcher.state !== 'idle'}
										aria-label={
											publishFetcher.state !== 'idle'
												? 'Publishing'
												: `Publish ${draftVersion.description ?? `version ${draftVersion.id}`}`
										}
										className="shrink-0 rounded-full bg-fuchsia-600 px-3 text-white shadow-md ring-2 shadow-fuchsia-600/25 ring-fuchsia-100 transition-all hover:-translate-y-px hover:bg-fuchsia-700 hover:shadow-lg hover:shadow-fuchsia-600/25 sm:px-4"
									>
										<Rocket className="mr-2 h-3.5 w-3.5" />
										<span className="sm:hidden">
											{publishFetcher.state !== 'idle'
												? 'Publishing...'
												: 'Publish'}
										</span>
										<span className="hidden sm:inline">
											{publishFetcher.state !== 'idle'
												? 'Publishing...'
												: `Publish ${draftVersion.description ?? `v${draftVersion.id}`}`}
										</span>
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

							<MobileNavigation
								pathname={location.pathname}
								isAdmin={user.role === 'admin'}
							/>
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
