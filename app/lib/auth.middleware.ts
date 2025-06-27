import { redirect } from "react-router";
import { createAuth } from "./auth.server";

export async function requireAuth(request: Request, env: Env) {
  const auth = createAuth(env);
  
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw redirect("/edge-cms/sign-in");
  }

  return session;
} 