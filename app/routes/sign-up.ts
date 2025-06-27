// Standard library imports only – we don't rely on Remix helpers here
// The route is a resource route that returns raw Response objects.

import { createAuth } from "~/lib/auth.server";
import { env } from "cloudflare:workers";

/*
  POST /edge-cms/sign-up
  ----------------------
  A private endpoint for programmatically creating users from CLI scripts or admin tooling.
  Security model: the caller must include the header `X-Admin-Secret` and the value must match
  the `ADMIN_SIGNUP_SECRET` environment variable configured for the Worker.

  Example:
    curl -X POST https://<domain>/edge-cms/sign-up \
       -H "Content-Type: application/json" \
       -H "X-Admin-Secret: $ADMIN_SIGNUP_SECRET" \
       -d '{"email":"[email protected]","password":"strong-pass","name":"Demo User"}'
*/

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  }

  // ---------------------------------------------------------------------------
  // 1. Authorization ─ ensure caller knows the shared secret
  // ---------------------------------------------------------------------------
  const adminSecretHeader = request.headers.get("x-admin-secret");
  const ADMIN_SECRET = (env as unknown as Record<string, string>)["ADMIN_SIGNUP_SECRET"];
  if (!adminSecretHeader || adminSecretHeader !== ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---------------------------------------------------------------------------
  // 2. Parse payload (accepts application/json or application/x-www-form-urlencoded)
  // ---------------------------------------------------------------------------
  let email: string | undefined;
  let password: string | undefined;
  let name: string | undefined;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      email = body.email as string | undefined;
      password = body.password as string | undefined;
      name = (body.name as string | undefined) ?? undefined;
    } else {
      const formData = await request.formData();
      email = formData.get("email") as string | undefined;
      password = formData.get("password") as string | undefined;
      name = (formData.get("name") as string | undefined) ?? undefined;
    }
  } catch (err) {
    return Response.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (!email || !password) {
    return Response.json({ error: "Missing required fields: email & password" }, { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // 3. Delegate to Better Auth so all hashing / validation logic stays intact
  // ---------------------------------------------------------------------------
  const auth = createAuth(env);
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: name ?? "User",
      },
    });

    if (result.user) {
      return Response.json(
        {
          success: true,
          userId: result.user.id,
          message: `User ${email} created successfully`,
        },
        { status: 201 },
      );
    }

    return Response.json({ error: "Unknown error while creating user" }, { status: 500 });
  } catch (error) {
    console.error("/edge-cms/sign-up error", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}