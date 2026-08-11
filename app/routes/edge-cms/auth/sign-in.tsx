import { Form, useActionData, redirect } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { createAuth } from '~/utils/auth.server';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/sign-in';
import { requireAnonymous } from '~/utils/auth.middleware';
import { APIError } from 'better-auth/api';
import { getHasAdmin } from '~/utils/db.server';
import { ArrowRight, LockKeyhole, Zap } from 'lucide-react';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnonymous(request, env);

	const hasAdmin = await getHasAdmin();
	if (!hasAdmin) {
		return redirect('/edge-cms/_a/sign-up');
	}

	return {};
}

export async function action({ request }: Route.ActionArgs) {
	const auth = createAuth(env);
	const formData = await request.formData();

	const email = formData.get('email') as string;
	const password = formData.get('password') as string;

	if (!email || !password) {
		return { error: 'Email and password are required' };
	}

	try {
		const { headers } = await auth.api.signInEmail({
			headers: request.headers,
			body: {
				email,
				password,
				callbackURL: '/edge-cms',
			},
			returnHeaders: true,
		});
		return redirect('/edge-cms', { headers });
	} catch (error) {
		if (error instanceof APIError) {
			return Response.json(
				{ error: (error as Error).message },
				{ status: error.statusCode },
			);
		}
		return Response.json({ error: 'Unknown error' }, { status: 500 });
	}
}

export default function SignIn() {
	const actionData = useActionData<typeof action>();

	return (
		<main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 sm:p-8">
			<div className="absolute top-14 left-[12%] h-2.5 w-2.5 rounded-full bg-yellow-400" />
			<div className="absolute right-[14%] bottom-20 h-2 w-2 rounded-full bg-fuchsia-400" />

			<section className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgb(15_23_42/0.12)] ring-1 ring-slate-200">
				<div className="relative overflow-hidden border-b border-sky-100 bg-sky-50 px-6 py-5 sm:px-8">
					<div className="absolute top-3 right-6 h-16 w-16 rounded-full border border-dashed border-fuchsia-200" />
					<div className="absolute top-8 right-10 h-2.5 w-2.5 rounded-full bg-yellow-400" />
					<div className="relative flex items-center gap-3">
						<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-600/20">
							<Zap className="h-4 w-4 fill-current" />
						</span>
						<div>
							<p className="font-bold tracking-[-0.03em] text-slate-950">
								EdgeCMS
							</p>
							<p className="text-[10px] font-semibold tracking-[0.16em] text-sky-700 uppercase">
								Instance administration
							</p>
						</div>
					</div>
				</div>

				<div className="px-6 py-8 sm:px-8 sm:py-10">
					<div>
						<p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-sky-600 uppercase">
							<LockKeyhole className="h-3.5 w-3.5" />
							Restricted access
						</p>
						<h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
							Sign in to this instance
						</h1>
						<p className="text-muted-foreground mt-2 text-sm leading-relaxed">
							Enter the credentials provided by this instance’s administrator.
						</p>
					</div>

					<Form method="post" className="mt-7 space-y-5">
						<div className="space-y-2">
							<Label htmlFor="email">Email address</Label>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								required
								autoFocus
								placeholder="you@example.com"
								className="h-11 bg-white"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								required
								placeholder="Enter your password"
								className="h-11 bg-white"
							/>
						</div>

						{actionData?.error && (
							<div
								role="alert"
								className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 ring-1 ring-red-200"
							>
								{actionData.error}
							</div>
						)}

						<Button type="submit" variant="brand" className="h-11 w-full">
							Sign in
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</Form>

					<p className="text-muted-foreground mt-7 text-center text-xs">
						Access is limited to authorised users.
					</p>
				</div>
			</section>
		</main>
	);
}
