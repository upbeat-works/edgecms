import { Form, useActionData, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { createAuth } from "~/lib/auth.server";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/sign-in";
import { requireAnonymous } from "~/lib/auth.middleware";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAnonymous(request, env);

  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const auth = createAuth(env);
  const formData = await request.formData();
  
  const intent = formData.get("intent");
  
  // Handle sign out
  if (intent === "signout") {
    return await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
  }
  
  // Handle sign in
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  
  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    // Try to sign in without asResponse to get the actual result
    const response = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      asResponse: true,
    });
    
    // If sign in was successful, redirect to dashboard
    if (response.ok) {
      return redirect("/edge-cms", response);
    }

    const { message } = await response.json() as { message: string };
    throw new Error(message);
  } catch (error) {
    return { error: (error as Error).message };
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