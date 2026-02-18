import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { versions, user } from '../schema.server';
import type { Version } from './types';

const db = drizzle(env.DB);

// Version operations
export async function getVersions(): Promise<Version[]> {
	const result = await db
		.select()
		.from(versions)
		.leftJoin(user, eq(versions.createdBy, user.id))
		.orderBy(desc(versions.id));

	return result.map(row => ({
		id: row.versions.id,
		description: row.versions.description,
		status: row.versions.status || 'draft',
		createdAt: new Date(row.versions.createdAt),
		createdBy: row.user?.name || 'System',
	}));
}

export async function getLatestVersion(
	status?: 'draft' | 'live' | 'archived',
): Promise<Version | null> {
	const result = await db
		.select()
		.from(versions)
		.where(status != null ? eq(versions.status, status) : sql`1 = 1`)
		.orderBy(desc(versions.id))
		.limit(1);
	if (result.length === 0) return null;

	const row = result[0];
	return {
		id: row.id,
		description: row.description,
		status: row.status || 'draft',
		createdAt: new Date(row.createdAt),
		createdBy: row.createdBy || null,
	};
}

export async function createVersion(
	description?: string,
	createdBy?: string,
): Promise<Version> {
	const result = await db
		.insert(versions)
		.values({
			description: description || null,
			status: 'draft',
			createdBy: createdBy || null,
		})
		.returning();

	const row = result[0];
	return {
		id: row.id,
		description: row.description,
		status: row.status || 'draft',
		createdAt: new Date(row.createdAt),
		createdBy: row.createdBy,
	};
}

export async function promoteVersion(versionId: number): Promise<void> {
	// Archive current live version
	await db
		.update(versions)
		.set({ status: 'archived' })
		.where(eq(versions.status, 'live'));

	// Promote target version to live
	await db
		.update(versions)
		.set({ status: 'live' })
		.where(eq(versions.id, versionId));
}

export async function releaseDraft(): Promise<void> {
	const instance = await env.RELEASE_VERSION_WORKFLOW.create({ params: {} });
	console.log('Created release version workflow: ', instance);
}

export async function rollbackVersion(versionId: number): Promise<void> {
	const instance = await env.ROLLBACK_VERSION_WORKFLOW.create({
		params: { versionId },
	});
	console.log('Created rollback version workflow: ', instance);
}

export async function updateVersionDescription(
	versionId: number,
	description: string,
): Promise<void> {
	await db
		.update(versions)
		.set({ description })
		.where(eq(versions.id, versionId));
}

export async function runAITranslation(userId?: string): Promise<string> {
	const instance = await env.AI_TRANSLATE_WORKFLOW.create({
		params: { userId },
	});
	console.log('Created AI translate workflow: ', instance);
	return instance.id;
}

export async function getAITranslateInstance(
	instanceId: string,
): Promise<WorkflowInstance> {
	const instance = await env.AI_TRANSLATE_WORKFLOW.get(instanceId);
	console.log('AI translate workflow instance: ', instance);
	return instance;
}
