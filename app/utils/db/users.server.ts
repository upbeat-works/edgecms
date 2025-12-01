import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { user } from '../schema.server';

const db = drizzle(env.DB);

// User operations
export async function getHasAdmin(): Promise<boolean> {
	const result = await db.select().from(user).where(eq(user.role, 'admin'));
	return result.length > 0;
}
