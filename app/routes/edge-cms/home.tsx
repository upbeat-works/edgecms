import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
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

function NavButtonGrid({ items }: { items: NavItem[] }) {
	return (
		<div className="grid grid-cols-2 gap-4">
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
			<div className="w-full max-w-md space-y-8 text-center">
				<div>
					<h1 className="text-4xl font-bold tracking-tight">EdgeCMS</h1>
					<p className="mt-2">Your cloudflare first CMS admin</p>
				</div>

				<NavButtonGrid items={builtInNavItems} />

				{hasCustomItems && (
					<>
						<Separator className="mx-auto data-[orientation=horizontal]:w-4/5" />
						<NavButtonGrid items={customNavItems} />
					</>
				)}
			</div>
		</div>
	);
}
