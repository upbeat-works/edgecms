import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "./schema.server";

export function createAuth(env: Env) {
  const db = drizzle(env.DB);
  
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema
    }),
    baseURL: env.BASE_URL || "http://localhost:5173",
    trustedOrigins: [env.BASE_URL || "http://localhost:5173"],
    secret: env.AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      }
    },
  });
}

export type Auth = ReturnType<typeof createAuth>; 