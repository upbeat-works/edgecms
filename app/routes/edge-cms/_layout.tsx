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
import { Sun, Moon, Key, Menu } from 'lucide-react';
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

const PUBLISH_TERMINAL_STATES = ['terminated', 'errored', 'complete'];

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(request, context.cloudflare.env);
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
	const [theme, setTheme] = useState<'light' | 'dark'>('light');
	const [mobileNavOpen, setMobileNavOpen] = useState(false);

	// When the publish action returns, push the instance id into the URL so the
	// loader can fetch its status and the dialog can survive page navigations.
	const fetcherPublishId = publishFetcher.data?.publishId;
	useEffect(() => {
		if (fetcherPublishId && searchParams.get('publishId') !== fetcherPublishId) {
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

	// Initialize theme from localStorage or system preference
	useEffect(() => {
		const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
		const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
			.matches
			? 'dark'
			: 'light';
		const initialTheme = savedTheme || systemTheme;
		setTheme(initialTheme);
		document.documentElement.setAttribute('data-theme', initialTheme);
	}, []);

	const toggleTheme = () => {
		const newTheme = theme === 'light' ? 'dark' : 'light';
		setTheme(newTheme);
		localStorage.setItem('theme', newTheme);
		document.documentElement.setAttribute('data-theme', newTheme);
	};

	useEffect(() => {
		setMobileNavOpen(false);
	}, [location.pathname]);

	return (
		<div className="bg-background min-h-screen">
			<header className="border-b px-4">
				<div className="container mx-auto">
					<nav className="flex h-16 items-center space-x-6">
						<Link to="/edge-cms" className="text-lg font-semibold">
							EdgeCMS
						</Link>

						<div className="ml-8 hidden items-center space-x-4 md:flex">
							{builtInNavItems.map(item => (
								<Link
									key={item.href}
									to={item.href}
									className={cn(
										'hover:text-primary text-sm font-medium transition-colors',
										location.pathname === item.href
											? 'text-foreground'
											: 'text-muted-foreground',
									)}
								>
									{item.label}
								</Link>
							))}
							{customNavItems.length > 0 && (
								<Separator orientation="vertical" className="h-5" />
							)}
							{customNavItems.map(item => (
								<Link
									key={item.href}
									to={item.href}
									className={cn(
										'hover:text-primary text-sm font-medium transition-colors',
										location.pathname === item.href
											? 'text-foreground'
											: 'text-muted-foreground',
									)}
								>
									{item.label}
								</Link>
							))}
						</div>

						<div className="ml-auto flex items-center space-x-4">
							{draftVersion && !isCustomPage && (
								<publishFetcher.Form
									method="post"
									action="/edge-cms/publish"
								>
									<Button
										type="submit"
										size="sm"
										disabled={publishFetcher.state !== 'idle'}
										className="bg-green-600 text-white hover:bg-green-700"
									>
										{publishFetcher.state !== 'idle'
											? 'Publishing...'
											: `Publish ${draftVersion.description ?? `v${draftVersion.id}`}`}
									</Button>
								</publishFetcher.Form>
							)}
							<Link
								to="/edge-cms/settings/api-keys"
								className={cn(
									'hover:text-primary hidden items-center gap-1 text-sm font-medium transition-colors md:flex',
									location.pathname === '/edge-cms/settings/api-keys'
										? 'text-foreground'
										: 'text-muted-foreground',
								)}
							>
								<Key className="h-4 w-4" />
								API Keys
							</Link>
							{user.role === 'admin' && (
								<Link
									to="/edge-cms/users"
									className={cn(
										'hover:text-primary hidden text-sm font-medium transition-colors md:inline',
										location.pathname === '/edge-cms/users'
											? 'text-foreground'
											: 'text-muted-foreground',
									)}
								>
									Users
								</Link>
							)}

							<Button
								variant="ghost"
								size="icon"
								onClick={toggleTheme}
								aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
								className="relative"
							>
								<Sun
									className={cn(
										'h-4 w-4 transition-all duration-300',
										theme === 'dark'
											? 'scale-0 rotate-90'
											: 'scale-100 rotate-0',
									)}
								/>
								<Moon
									className={cn(
										'absolute h-4 w-4 transition-all duration-300',
										theme === 'light'
											? 'scale-0 -rotate-90'
											: 'scale-100 rotate-0',
									)}
								/>
							</Button>

							<form
								action="/edge-cms/sign-out"
								method="post"
								className="hidden md:block"
							>
								<button
									type="submit"
									className="text-muted-foreground hover:text-foreground text-sm"
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
									<SheetTitle>Menu</SheetTitle>
									<nav className="mt-6 flex flex-col space-y-1">
										{builtInNavItems.map(item => (
											<SheetClose asChild key={item.href}>
												<Link
													to={item.href}
													className={cn(
														'hover:bg-accent rounded-md px-3 py-2 text-sm font-medium transition-colors',
														location.pathname === item.href
															? 'text-foreground bg-accent'
															: 'text-muted-foreground',
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
														'hover:bg-accent rounded-md px-3 py-2 text-sm font-medium transition-colors',
														location.pathname === item.href
															? 'text-foreground bg-accent'
															: 'text-muted-foreground',
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
													'hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
													location.pathname ===
														'/edge-cms/settings/api-keys'
														? 'text-foreground bg-accent'
														: 'text-muted-foreground',
												)}
											>
												<Key className="h-4 w-4" />
												API Keys
											</Link>
										</SheetClose>
										{user.role === 'admin' && (
											<SheetClose asChild>
												<Link
													to="/edge-cms/users"
													className={cn(
														'hover:bg-accent rounded-md px-3 py-2 text-sm font-medium transition-colors',
														location.pathname === '/edge-cms/users'
															? 'text-foreground bg-accent'
															: 'text-muted-foreground',
													)}
												>
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
