import { Form, useActionData, redirect } from 'react-router';
import { APIError } from 'better-auth/api';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { createAuth } from '~/utils/auth.server';
import { env } from 'cloudflare:workers';
import type { Route } from './+types/sign-up';
import { requireAnonymous } from '~/utils/auth.middleware';
import { getExistingUsersCount } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast/toast.server';

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnonymous(request, env);

	const accountsCount = await getExistingUsersCount();
	if (accountsCount > 0) {
		return redirectWithToast(
			'/edge-cms/sign-in',
			{
				title: 'Sign up',
				description: 'Please use admin UI to create new users.',
				type: 'error',
			},
			{ headers: request.headers },
		);
	}

	return new Response('ok');
}

export async function action({ request }: Route.ActionArgs) {
	const auth = createAuth(env);
	const formData = await request.formData();
	const email = formData.get('email') as string;
	const password = formData.get('password') as string;
	const name = formData.get('name') as string;

	if (!email || !password || !name) {
		return { error: 'Email and password are required' };
	}

	try {
		const result = await auth.api.signUpEmail({
			headers: request.headers,
			body: {
				email,
				password,
				name,
			},
			returnHeaders: true,
		});

		return redirect('/edge-cms/sign-in', { headers: result.headers });
	} catch (error) {
		console.error('/edge-cms/sign-up error', error);
		if (error instanceof APIError) {
			return Response.json(
				{ error: (error as Error).message },
				{ status: error.statusCode },
			);
		}
		return Response.json({ error: 'Unknown error' }, { status: 500 });
	}
}

export default function SignUp() {
	const actionData = useActionData<typeof action>();

	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
			<div className="w-full max-w-md space-y-8">
				<div>
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
						Sign up for EdgeCMS
					</h2>
				</div>
				<Form method="post" className="mt-8 space-y-6">
					<div className="space-y-4 rounded-md">
						<div>
							<label htmlFor="adminSecret" className="sr-only">
								Admin Secret
							</label>
							<Input
								id="adminSecret"
								name="adminSecret"
								type="password"
								required
								placeholder="Admin Secret"
							/>
						</div>
						<div>
							<label htmlFor="name" className="sr-only">
								Full name
							</label>
							<Input
								id="name"
								name="name"
								type="text"
								autoComplete="name"
								placeholder="Full name (optional)"
							/>
						</div>
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
								autoComplete="new-password"
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
							Sign up
						</Button>
					</div>
				</Form>
			</div>
		</div>
	);
}
