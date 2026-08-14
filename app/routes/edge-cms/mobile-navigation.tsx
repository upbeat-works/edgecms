import { Key, Menu, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Separator } from '~/components/ui/separator';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '~/components/ui/sheet';
import { builtInNavItems, customNavItems } from '~/nav-items';
import { cn } from '~/utils/misc';

function isActivePath(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNavigation({
	pathname,
	isAdmin,
}: {
	pathname: string;
	isAdmin: boolean;
}) {
	const [open, setOpen] = useState(false);
	const closeMenu = () => setOpen(false);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<button
					type="button"
					aria-label="Navigation menu"
					className="hover:bg-accent focus-visible:ring-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
				>
					<Menu className="h-5 w-5" />
				</button>
			</SheetTrigger>
			<SheetContent
				side="right"
				size="sm"
				className="w-[min(22rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-l-2xl md:hidden"
			>
				<SheetHeader className="mb-5">
					<SheetTitle>Navigation</SheetTitle>
					<SheetDescription className="sr-only">
						Choose an EdgeCMS section or manage your session.
					</SheetDescription>
				</SheetHeader>
				<nav aria-label="Mobile navigation" className="flex flex-col space-y-1">
					{builtInNavItems.map(item => (
						<Link
							key={item.href}
							to={item.href}
							onClick={closeMenu}
							aria-current={
								isActivePath(pathname, item.href) ? 'page' : undefined
							}
							className={cn(
								'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
								isActivePath(pathname, item.href)
									? 'bg-sky-50 text-sky-700'
									: 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
							)}
						>
							{item.label}
						</Link>
					))}
					{customNavItems.length > 0 && <Separator className="my-2" />}
					{customNavItems.map(item => (
						<Link
							key={item.href}
							to={item.href}
							onClick={closeMenu}
							aria-current={
								isActivePath(pathname, item.href) ? 'page' : undefined
							}
							className={cn(
								'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
								isActivePath(pathname, item.href)
									? 'bg-fuchsia-50 text-fuchsia-700'
									: 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
							)}
						>
							{item.label}
						</Link>
					))}
					<Separator className="my-2" />
					<Link
						to="/edge-cms/settings/api-keys"
						onClick={closeMenu}
						aria-current={
							isActivePath(pathname, '/edge-cms/settings/api-keys')
								? 'page'
								: undefined
						}
						className={cn(
							'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
							isActivePath(pathname, '/edge-cms/settings/api-keys')
								? 'bg-sky-50 text-sky-700'
								: 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
						)}
					>
						<Key className="h-4 w-4" />
						API keys
					</Link>
					{isAdmin ? (
						<Link
							to="/edge-cms/users"
							onClick={closeMenu}
							aria-current={
								isActivePath(pathname, '/edge-cms/users') ? 'page' : undefined
							}
							className={cn(
								'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
								isActivePath(pathname, '/edge-cms/users')
									? 'bg-sky-50 text-sky-700'
									: 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
							)}
						>
							<UserRound className="h-4 w-4" />
							Users
						</Link>
					) : null}
					<form action="/edge-cms/sign-out" method="post" className="pt-2">
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
	);
}
