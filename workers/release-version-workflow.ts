import {
	WorkflowEntrypoint,
	type WorkflowStep,
	type WorkflowEvent,
} from 'cloudflare:workers';
import {
	getLanguages,
	getLatestVersion,
	getTranslationsByLocale,
	promoteVersion,
} from '~/lib/db.server';
import { gzipString } from '~/lib/gzip';

type Params = {};

export class ReleaseVersionWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const draftVersion = await step.do(
			'get draft version',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 seconds',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Getting draft version');
				const draftVersion = await getLatestVersion('draft');
				if (!draftVersion) {
					throw new Error('No draft version found');
				}
				return draftVersion;
			},
		);

		const [defaultLanguage, restLanguages] = await step.do(
			'get languages',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 seconds',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Getting languages');
				const languages = await getLanguages();

				let defaultLanguage = null;
				let restLanguages = [];
				for (const language of languages) {
					if (language.default) {
						defaultLanguage = language;
					} else {
						restLanguages.push(language);
					}
				}

				if (!defaultLanguage) {
					throw new Error('No default language found');
				}

				return [defaultLanguage, restLanguages];
			},
		);

		const defaultTranslations = await step.do(
			'get default translations',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '1 minute',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Getting default translations');
				const defaultTranslations = await getTranslationsByLocale(
					defaultLanguage.locale,
				);
				return defaultTranslations;
			},
		);

		const restTranslations = await step.do(
			'get rest translations',
			{
				retries: {
					limit: 3,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '2 minutes',
			},
			async () => {
				console.log(
					'[ReleaseVersionWorkflow] Getting the rest of the translations',
				);
				const restTranslations = await Promise.all(
					restLanguages.map(async language => {
						const translations = await getTranslationsByLocale(language.locale);
						return translations;
					}),
				);

				return restTranslations;
			},
		);

		const jsonFiles = await step.do(
			'generate json files',
			{
				retries: {
					limit: 2,
					delay: '1 second',
					backoff: 'linear',
				},
				timeout: '30 seconds',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Generating json files');
				const defaultTranslationsMap = defaultTranslations.reduce(
					(acc, translation) => {
						acc[translation.key] = translation.value;
						return acc;
					},
					{} as Record<string, string>,
				);

				const files: { filename: string; content: string }[] = [
					{
						filename: `${draftVersion.id}/${defaultLanguage.locale}.json`,
						content: JSON.stringify(defaultTranslationsMap),
					},
				];

				restTranslations.forEach(translations => {
					if (translations.length === 0) {
						return;
					}

					const locale = translations[0].language;
					const translationMap = translations.reduce(
						(acc, translation) => {
							acc[translation.key] = translation.value;
							return acc;
						},
						{ ...defaultTranslationsMap },
					);

					// Store in R2 bucket as JSON file
					const filename = `${draftVersion.id}/${locale}.json`;
					const content = JSON.stringify(translationMap);

					files.push({
						filename,
						content,
					});
				});

				return files;
			},
		);

		await step.do(
			'save json files',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '3 minutes',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Saving json files');
				await Promise.all(
					jsonFiles.map(({ filename, content }) =>
						this.env.BACKUPS_BUCKET.put(filename, content, {
							httpMetadata: {
								contentType: 'application/json',
								cacheControl: 'public, immutable, max-age=31536000', // 1 year
							},
						}),
					),
				);
			},
		);

		await step.do(
			'generate backup file',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '2 minutes',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Generating backup file');
				const backup = [defaultTranslations, ...restTranslations];

				const compressed = await gzipString(JSON.stringify(backup));
				await this.env.BACKUPS_BUCKET.put(
					`${draftVersion.id}/backup.gz`,
					compressed,
				);
			},
		);

		await step.do(
			'promote draft version',
			{
				retries: {
					limit: 5,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '1 minute',
			},
			async () => {
				console.log('[ReleaseVersionWorkflow] Promoting draft version');
				await promoteVersion(draftVersion.id);
			},
		);
	}
}
