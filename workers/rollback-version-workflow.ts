import {
	WorkflowEntrypoint,
	type WorkflowStep,
	type WorkflowEvent,
} from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { versions } from '~/utils/schema.server';
import {
	getDefaultLocale,
	promoteVersion,
	restoreBlocksFromBackup,
	restoreTranslationsFromBackup,
} from '~/utils/db.server';
import { drizzle } from 'drizzle-orm/d1';
import { gunzipString } from '~/utils/gzip';

type Params = {
	versionId: number;
};

export class RollbackVersionWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { versionId } = event.payload;
		const db = drizzle(this.env.DB);

		await step.do(
			'check if version exists',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 seconds',
			},
			async () => {
				console.log('[RollbackVersionWorkflow] Checking if version exists');
				try {
					const [version] = await db
						.select()
						.from(versions)
						.where(eq(versions.id, versionId));
					if (!version || version.status !== 'archived') {
						throw new Error('Version not found');
					}
					return version;
				} catch (error) {
					console.error(error);
					throw new Error('Failed to check if version exists');
				}
			},
		);

		// Read before the restore wipes it: a backup written before the format
		// recorded its default locale can only fall back to the current one.
		const fallbackDefaultLocale = await step.do(
			'read current default locale',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 seconds',
			},
			async () => getDefaultLocale(),
		);

		// Fetching, wiping and restoring belong to one step: they are a single
		// logical replacement, and splitting them lets a failure land between the
		// delete and the insert, leaving the CMS with no content at all.
		await step.do(
			'restore translations from backup',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '3 minutes',
			},
			async () => {
				console.log(
					'[RollbackVersionWorkflow] Restoring translations from backup',
				);

				const file = await this.env.BACKUPS_BUCKET.get(
					`${versionId}/backup.gz`,
				);
				if (!file) {
					throw new Error('Backup file not found');
				}

				const backup = JSON.parse(await gunzipString(await file.bytes()));

				await restoreTranslationsFromBackup(backup, { fallbackDefaultLocale });
			},
		);

		const blocksBackupData = await step.do(
			'get blocks backup',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '2 minutes',
			},
			async () => {
				console.log('[RollbackVersionWorkflow] Getting blocks backup');
				try {
					const file = await this.env.BACKUPS_BUCKET.get(
						`${versionId}/blocks-backup.gz`,
					);
					if (!file) {
						console.log(
							'[RollbackVersionWorkflow] No blocks backup found (pre-feature version), skipping',
						);
						return null;
					}

					const data = await file.bytes();
					const backup = await gunzipString(data);
					return JSON.parse(backup);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to get blocks backup data');
				}
			},
		);

		await step.do(
			'restore blocks from backup',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '3 minutes',
			},
			async () => {
				if (!blocksBackupData) {
					console.log(
						'[RollbackVersionWorkflow] No blocks backup data, skipping restore',
					);
					return;
				}
				console.log('[RollbackVersionWorkflow] Restoring blocks from backup');
				try {
					await restoreBlocksFromBackup(blocksBackupData);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to restore blocks from backup');
				}
			},
		);

		await step.do(
			'promote archived version',
			{
				retries: {
					limit: 5,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '1 minute',
			},
			async () => {
				console.log('[RollbackVersionWorkflow] Promoting archived version');
				try {
					await promoteVersion(versionId);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to promote archived version');
				}
			},
		);
	}
}
