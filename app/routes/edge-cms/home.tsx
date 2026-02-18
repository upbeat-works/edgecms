import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
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

export default function Home() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="w-full max-w-md space-y-8 text-center">
				<div>
					<h1 className="text-4xl font-bold tracking-tight">EdgeCMS</h1>
					<p className="mt-2">Your cloudflare first CMS admin</p>
				</div>

				<div className="space-y-4">
					<Button asChild className="w-full" size="lg" variant="outline">
						<Link to="/edge-cms/i18n">Translations</Link>
					</Button>

					<Button asChild className="w-full" size="lg" variant="outline">
						<Link to="/edge-cms/media">Media</Link>
					</Button>

					<Button asChild className="w-full" size="lg" variant="outline">
						<Link to="/edge-cms/blocks">Blocks</Link>
					</Button>

					<Button asChild className="w-full" size="lg" variant="outline">
						<Link to="/edge-cms/sections">Sections</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
