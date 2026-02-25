import { getLatestVersion, createVersion } from './db/versions.server';

export async function ensureDraftVersion(userId?: string): Promise<void> {
	const [draftVersion, liveVersion] = await Promise.all([
		getLatestVersion('draft'),
		getLatestVersion('live'),
	]);

	if (draftVersion == null) {
		const description = liveVersion
			? `fork from v${liveVersion.id}`
			: new Date().toISOString().split('T')[0];
		await createVersion(description, userId);
	}
}
