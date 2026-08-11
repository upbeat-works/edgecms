import { Link } from 'react-router';
import {
	ArrowUpRight,
	Blocks,
	FileText,
	Image,
	Languages,
	Rocket,
	Sparkles,
	Zap,
	type LucideIcon,
} from 'lucide-react';
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

const destinationDetails: Record<
	string,
	{ description: string; icon: LucideIcon; accent: string }
> = {
	'/edge-cms/i18n': {
		description: 'Write, translate and keep every locale in sync.',
		icon: Languages,
		accent: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
	},
	'/edge-cms/media': {
		description: 'Organise the images and files used across your content.',
		icon: Image,
		accent:
			'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
	},
	'/edge-cms/blocks': {
		description: 'Shape reusable content and manage its entries.',
		icon: Blocks,
		accent:
			'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
	},
	'/edge-cms/sections': {
		description: 'Keep related content grouped and easy to navigate.',
		icon: FileText,
		accent: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
	},
};

function DestinationCard({
	item,
	kind = 'built-in',
}: {
	item: NavItem;
	kind?: 'built-in' | 'custom';
}) {
	const detail = destinationDetails[item.href] ?? {
		description: 'Open this workspace extension.',
		icon: Sparkles,
		accent:
			'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
	};
	const Icon = detail.icon;

	return (
		<Link
			to={item.href}
			className="group bg-card relative min-h-44 overflow-hidden rounded-xl p-4 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgb(14_165_233/0.12)] hover:ring-sky-500/30 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:ring-white/10"
		>
			<div className="flex items-start justify-between">
				<div
					className={`flex h-10 w-10 items-center justify-center rounded-xl ${detail.accent}`}
				>
					<Icon className="h-5 w-5" />
				</div>
				<ArrowUpRight className="text-muted-foreground h-4 w-4 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-sky-600" />
			</div>
			<div className="mt-6">
				<div className="flex items-center gap-2">
					<h2 className="font-semibold tracking-tight">{item.label}</h2>
					{kind === 'custom' ? (
						<span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
							Custom
						</span>
					) : null}
				</div>
				<p className="text-muted-foreground mt-1 text-sm leading-relaxed">
					{detail.description}
				</p>
			</div>
		</Link>
	);
}

export default function Home() {
	return (
		<main className="container mx-auto px-4 py-7 sm:py-10">
			<section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-sky-50/70 to-fuchsia-50/50 px-6 py-9 shadow-[0_16px_48px_rgb(14_165_233/0.08)] ring-1 ring-sky-100 sm:px-10 sm:py-12">
				<div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-yellow-200/45" />
				<div className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-fuchsia-200/25 blur-3xl" />
				<div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
					<div>
						<p className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-700 uppercase">
							<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shadow-sky-600/25">
								<Zap className="h-3.5 w-3.5 fill-current" />
							</span>
							EdgeCMS
						</p>
						<h1 className="max-w-2xl text-4xl leading-[1.02] font-bold tracking-[-0.05em] text-slate-950 sm:text-5xl lg:text-6xl">
							Your Cloudflare-first
							<br />
							<span className="relative text-sky-600">
								content workspace.
								<span className="absolute -bottom-1 left-0 h-1.5 w-28 rounded-full bg-fuchsia-400/75" />
							</span>
						</h1>
						<p className="mt-6 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
							Manage content, translations and media close to the people who use
							it—without dragging around a traditional CMS.
						</p>
					</div>

					<div className="relative mx-auto h-52 w-full max-w-sm sm:h-60">
						<div className="absolute right-7 bottom-3 h-44 w-44 rounded-full border border-sky-200 bg-white/70 shadow-[0_20px_50px_rgb(14_165_233/0.12)] sm:h-52 sm:w-52" />
						<div className="absolute right-12 bottom-8 h-32 w-32 rounded-full border border-dashed border-fuchsia-300 sm:h-40 sm:w-40" />
						<div className="absolute right-20 bottom-16 flex h-20 w-20 -rotate-12 items-center justify-center rounded-3xl bg-sky-600 text-white shadow-[0_18px_35px_rgb(14_165_233/0.3)] sm:right-24 sm:bottom-20 sm:h-24 sm:w-24">
							<Rocket className="h-10 w-10 -rotate-45 sm:h-12 sm:w-12" />
						</div>
						<div className="absolute right-40 bottom-8 h-1.5 w-16 -rotate-[28deg] rounded-full bg-fuchsia-400/80 sm:right-48 sm:bottom-10" />
						<div className="absolute right-44 bottom-3 h-1.5 w-11 -rotate-[28deg] rounded-full bg-yellow-400/90 sm:right-52 sm:bottom-4" />
						<div className="absolute top-4 right-9 h-3 w-3 rounded-full bg-yellow-400" />
						<div className="absolute top-12 left-10 h-2 w-2 rounded-full bg-fuchsia-400" />
						<p className="absolute right-0 bottom-0 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-sky-700 uppercase shadow-sm ring-1 ring-sky-100">
							Built for the edge
						</p>
					</div>
				</div>
			</section>

			<section className="mt-10">
				<div className="mb-4 flex items-baseline gap-2">
					<h2 className="text-sm font-semibold tracking-tight">Workspace</h2>
					<span className="text-muted-foreground text-xs tabular-nums">
						{builtInNavItems.length}
					</span>
					<div className="bg-border/70 h-px flex-1" />
				</div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{builtInNavItems.map(item => (
						<DestinationCard key={item.href} item={item} />
					))}
				</div>
			</section>

			{customNavItems.length > 0 ? (
				<section className="mt-10">
					<div className="mb-4 flex items-baseline gap-2">
						<h2 className="text-sm font-semibold tracking-tight">Extensions</h2>
						<span className="text-muted-foreground text-xs tabular-nums">
							{customNavItems.length}
						</span>
						<div className="bg-border/70 h-px flex-1" />
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{customNavItems.map(item => (
							<DestinationCard key={item.href} item={item} kind="custom" />
						))}
					</div>
				</section>
			) : null}
		</main>
	);
}
