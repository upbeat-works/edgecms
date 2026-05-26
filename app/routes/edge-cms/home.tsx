import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import { builtInNavItems, customNavItems } from '~/nav-items';
import type { NavItem } from '~/extension.types';
import type { Route } from './+types/home';
import { requireAuth } from '~/utils/auth.middleware';
import { env } from 'cloudflare:workers';

export function meta({}: Route.MetaArgs) {
	return [
		{ title: 'EdgeCMS Dashboard' },
		{ name: 'description', content: 'EdgeCMS content management dashboard' },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAuth(request, env);

	return new Response('ok');
}

function NavButtonColumn({ items }: { items: NavItem[] }) {
	return (
		<div className="flex-1 space-y-4">
			{items.map(item => (
				<Button
					key={item.href}
					asChild
					className="w-full"
					size="lg"
					variant="outline"
				>
					<Link to={item.href}>{item.label}</Link>
				</Button>
			))}
		</div>
	);
}

export default function Home() {
	const hasCustomItems = customNavItems.length > 0;

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div
				className={`w-full space-y-8 text-center ${hasCustomItems ? 'max-w-2xl' : 'max-w-md'}`}
			>
				<div>
					<h1 className="text-4xl font-bold tracking-tight">EdgeCMS</h1>
					<p className="mt-2">Your cloudflare first CMS admin</p>
				</div>

				{hasCustomItems ? (
					<div className="flex items-stretch gap-8">
						<NavButtonColumn items={builtInNavItems} />
						<div
						aria-hidden
						className="via-border w-px self-stretch bg-gradient-to-b from-transparent to-transparent"
					/>
						<NavButtonColumn items={customNavItems} />
					</div>
				) : (
					<NavButtonColumn items={builtInNavItems} />
				)}
			</div>
		</div>
	);
}
