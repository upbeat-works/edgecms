import { Form, useActionData, redirect } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { createAuth } from '~/utils/auth.server';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/sign-in';
import { requireAnonymous } from '~/utils/auth.middleware';
import { APIError } from 'better-auth/api';
import { getHasAdmin } from '~/utils/db.server';

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
		<div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
			<div className="w-full max-w-md space-y-8">
				<div>
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
						Sign in to EdgeCMS
					</h2>
				</div>
				<Form method="post" className="mt-8 space-y-6">
					<div className="space-y-4 rounded-md">
						<div>
							<label htmlFor="email" className="sr-only">
								Email address
							</label>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								required
								placeholder="Email address"
							/>
						</div>
						<div>
							<label htmlFor="password" className="sr-only">
								Password
							</label>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								required
								placeholder="Password"
							/>
						</div>
					</div>

					{actionData?.error && (
						<div className="text-sm text-red-600 dark:text-red-400">
							{actionData.error}
						</div>
					)}

					<div>
						<Button type="submit" className="w-full">
							Sign in
						</Button>
					</div>
				</Form>
			</div>
		</div>
	);
}
