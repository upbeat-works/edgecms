import {
	WorkflowEntrypoint,
	type WorkflowStep,
	type WorkflowEvent,
} from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { languages, translations, versions } from '~/lib/schema.server';
import { promoteVersion } from '~/lib/db.server';
import { drizzle } from 'drizzle-orm/d1';
import { gunzipString } from '~/lib/gzip';

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

		const backupData = await step.do(
			'get backup data',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '2 minutes',
			},
			async () => {
				console.log('[RollbackVersionWorkflow] Getting backup data');
				try {
					const file = await this.env.BACKUPS_BUCKET.get(
						`${versionId}/backup.gz`,
					);
					if (!file) {
						throw new Error('Backup file not found');
					}

					const data = await file.bytes();
					const backup = await gunzipString(data);
					const backupData = JSON.parse(backup);
					return backupData;
				} catch (error) {
					console.error(error);
					throw new Error('Failed to get backup data');
				}
			},
		);

		await step.do(
			'delete translations and languages',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '1 minute',
			},
			async () => {
				console.log(
					'[RollbackVersionWorkflow] Deleting translations and languages',
				);
				try {
					await db.delete(translations);
					await db.delete(languages);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to delete translations and languages');
				}
			},
		);

		await step.do(
			'insert languages from backup data',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '1 minute',
			},
			async () => {
				console.log(
					'[RollbackVersionWorkflow] Inserting languages from backup data',
				);
				try {
					const availableLanguages = backupData
						.map((item: any) => item[0])
						// backwards compatibility with old backup format
						.filter((item: any) => item != null)
						.map((item: any) => item.language);

					if (availableLanguages.length === 0) {
						return;
					}

					await db.insert(languages).values(
						availableLanguages.map((language: string, index: number) => ({
							locale: language,
							default: index === 0,
						})),
					);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to insert languages');
				}
			},
		);

		await step.do(
			'insert translations from backup data',
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
					'[RollbackVersionWorkflow] Inserting translations from backup data',
				);
				try {
					await Promise.all(
						backupData
							// backwards compatibility with old backup format
							.filter((values: any) => values.length > 0)
							.flatMap((values: any) => {
								const BATCH_SIZE = 25;
								const batches = [];

								for (let i = 0; i < values.length; i += BATCH_SIZE) {
									batches.push(values.slice(i, i + BATCH_SIZE));
								}
								return batches.map((batch: any) =>
									db.insert(translations).values(batch),
								);
							}),
					);
				} catch (error) {
					console.error(error);
					throw new Error('Failed to insert translations from backup data');
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
