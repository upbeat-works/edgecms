import { Link, Outlet, useLocation, useLoaderData } from 'react-router';
import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import { requireAuth } from '~/utils/auth.middleware';
import type { Route } from './+types/_layout';

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(request, context.cloudflare.env);
	return { user };
}

export default function Layout() {
	const { user } = useLoaderData<typeof loader>();
	const location = useLocation();
	const [theme, setTheme] = useState<'light' | 'dark'>('light');

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

	const navItems = [
		{ href: '/edge-cms/i18n', label: 'Translations' },
		{ href: '/edge-cms/media', label: 'Media' },
		{ href: '/edge-cms/blocks', label: 'Blocks' },
		{ href: '/edge-cms/sections', label: 'Sections' },
	];

	return (
		<div className="bg-background min-h-screen">
			<header className="border-b">
				<div className="container mx-auto px-4">
					<nav className="flex h-16 items-center space-x-6">
						<Link to="/edge-cms" className="text-lg font-semibold">
							EdgeCMS
						</Link>

						<div className="ml-8 flex items-center space-x-4">
							{navItems.map(item => (
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
							{user.role === 'admin' && (
								<Link
									to="/edge-cms/users"
									className={cn(
										'hover:text-primary text-sm font-medium transition-colors',
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

							<form action="/edge-cms/sign-out" method="post">
								<button
									type="submit"
									className="text-muted-foreground hover:text-foreground text-sm"
								>
									Sign Out
								</button>
							</form>
						</div>
					</nav>
				</div>
			</header>

			<main className="flex-1">
				<Outlet />
			</main>
		</div>
	);
}
