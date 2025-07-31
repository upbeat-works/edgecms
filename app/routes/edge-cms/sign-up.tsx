import { Form, useActionData, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { createAuth } from "~/lib/auth.server";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/sign-up";
import { requireAnonymous } from "~/lib/auth.middleware";
// @ts-expect-error -- is using node:crypto
import { timingSafeEqual } from "node:crypto";

function logFailedSignup(request: Request, reason: string) {
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";
  const adminSecret = request.headers.get("Admin-Secret") || "unknown";

  console.warn("Failed admin signup attempt", {
    ip: clientIP,
    userAgent: userAgent,
    timestamp: new Date().toISOString(),
    reason
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAnonymous(request, env);

  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const auth = createAuth(env, request);
  const formData = await request.formData();

  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `admin-signup:${clientIP}`;  

  if (typeof env.RATE_LIMITER !== "undefined") {
    const { success } = await env.RATE_LIMITER.limit({ key })
    if (!success) {
      logFailedSignup(request, "rate_limit_exceeded");
      return new Response(`429 Failure – rate limit exceeded for ${key}`, { status: 429 });
    }
  }
  
  // Check admin secret
  const providedSecret = formData.get("adminSecret") as string;
  
  if (providedSecret.length !== env.ADMIN_SIGNUP_PASSWORD.length) {
    logFailedSignup(request, "invalid_secret");
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const a = encoder.encode(providedSecret);
  const b = encoder.encode(env.ADMIN_SIGNUP_PASSWORD);

  if (a.byteLength !== b.byteLength) {
    logFailedSignup(request, "invalid_secret");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!timingSafeEqual(a, b)) {
    logFailedSignup(request, "invalid_secret");
    return new Response("Unauthorized", { status: 401 });
  }

  // Handle sign up
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  
  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: name || "User",
      },
    });

    if (result.user) {
      // After successful sign up, redirect to sign in page
      return redirect("/edge-cms/sign-in");
    }

    return { error: "Unknown error while creating user" };
  } catch (error) {
    console.error("/edge-cms/sign-up error", error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
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