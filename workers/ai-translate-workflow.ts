import {
	WorkflowEntrypoint,
	type WorkflowStep,
	type WorkflowEvent,
} from 'cloudflare:workers';
import {
	getLanguages,
	getLatestVersion,
	getTranslations,
	getMissingTranslationsForLanguage,
	createVersion,
	bulkUpsertTranslations,
	type Language,
	type Translation,
} from '~/lib/db.server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

type Params = {
	userId?: string;
};

// Schema for AI translation response
const translationSchema = z.object({
	translations: z.record(z.string(), z.string()),
});

export class AITranslateWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { userId } = event.payload;

		// Step 1: Get all languages and identify default
		const [defaultLanguage, otherLanguages] = await step.do(
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
				console.log('[AITranslateWorkflow] Getting languages');
				const languages = await getLanguages();

				let defaultLanguage: Language | null = null;
				const otherLanguages: Language[] = [];

				for (const language of languages) {
					if (language.default) {
						defaultLanguage = language;
					} else {
						otherLanguages.push(language);
					}
				}

				if (!defaultLanguage) {
					throw new Error('No default language found');
				}

				if (otherLanguages.length === 0) {
					throw new Error('No target languages found for translation');
				}

				return [defaultLanguage, otherLanguages];
			},
		);

		// Step 2: Collect all missing translations data in parallel with nested steps
		const languagesWithMissingTranslations = await step.do(
			'identify all missing translations',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '3 minutes',
			},
			async () => {
				console.log(
					'[AITranslateWorkflow] Identifying missing translations for all languages in parallel',
				);

				// Use Promise.all to parallelize missing translation detection
				const allResults = await Promise.all(
					otherLanguages.map(async language => {
						return await step.do(
							`identify missing translations for ${language.locale}`,
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
									`[AITranslateWorkflow] Identifying missing translations for ${language.locale}`,
								);

								const missing = await getMissingTranslationsForLanguage(
									defaultLanguage.locale,
									language.locale,
								);

								console.log(
									`[AITranslateWorkflow] Found ${missing.length} missing translations for ${language.locale}`,
								);

								return {
									language,
									missingTranslations: missing,
								};
							},
						);
					}),
				);

				// Filter out languages with no missing translations
				const results = allResults.filter(
					result => result.missingTranslations.length > 0,
				);

				console.log(
					`[AITranslateWorkflow] Completed parallel missing translation detection for ${otherLanguages.length} languages, ${results.length} need translations`,
				);
				return results;
			},
		);

		if (languagesWithMissingTranslations.length === 0) {
			console.log(
				'[AITranslateWorkflow] No missing translations found. Workflow completed.',
			);
			return;
		}

		// Step 3: Generate AI translations for each language with nested steps and parallelization
		const allTranslationResults = await step.do(
			'generate all ai translations',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 minutes',
			},
			async () => {
				console.log(
					'[AITranslateWorkflow] Starting parallel AI translation generation for all languages',
				);

				// Use Promise.all to parallelize language translations
				const results = await Promise.all(
					languagesWithMissingTranslations.map(
						async ({ language, missingTranslations }) => {
							// Nested step for each language translation
							return await step.do(
								`ai translate for ${language.locale}`,
								{
									retries: {
										limit: 5,
										delay: '5 seconds',
										backoff: 'exponential',
									},
									timeout: '10 minutes',
								},
								async () => {
									console.log(
										`[AITranslateWorkflow] Generating AI translations for ${language.locale} (${missingTranslations.length} keys)`,
									);

									// Create OpenAI client inside the step to avoid external state dependency
									const openai = createOpenAI({
										apiKey: this.env.OPENAI_API_KEY,
									});

									// Convert missing translations to key-value pairs for translation
									const translationsToTranslate: Record<string, string> = {};
									for (const translation of missingTranslations) {
										translationsToTranslate[translation.key] =
											translation.value;
									}

									// Generate AI translations in batches with nested steps and parallelization
									const batchSize = 300;
									const keys = Object.keys(translationsToTranslate);

									// Create batch promises for parallel execution
									const batchPromises: Promise<Record<string, string>>[] = [];

									for (let i = 0; i < keys.length; i += batchSize) {
										const batchIndex = Math.floor(i / batchSize) + 1;
										const batchKeys = keys.slice(i, i + batchSize);

										// Create promise for each batch
										const batchPromise = step.do(
											`ai translate batch ${batchIndex} for ${language.locale}`,
											{
												retries: {
													limit: 3,
													delay: '3 seconds',
													backoff: 'exponential',
												},
												timeout: '5 minutes',
											},
											async () => {
												const batchTranslations: Record<string, string> = {};

												for (const key of batchKeys) {
													batchTranslations[key] = translationsToTranslate[key];
												}

												console.log(
													`[AITranslateWorkflow] Translating batch ${batchIndex} (${batchKeys.length} keys) for ${language.locale}`,
												);

												const { object } = await generateObject({
													model: openai('gpt-4o-mini'),
													schema: translationSchema,
													prompt: `Translate the following key-value pairs from ${defaultLanguage.locale} to ${language.locale}.

Preserve the structure of the values and maintain any placeholders, variables, or formatting.
For technical terms, maintain consistency across all translations.
If a value contains HTML tags, preserve them exactly.
If a value is empty or just whitespace, leave it empty.

Source language: ${defaultLanguage.locale}
Target language: ${language.locale}

Translations to translate:
${JSON.stringify(batchTranslations, null, 2)}

Return the translations with the same keys but translated values.`,
												});

												console.log(
													`[AITranslateWorkflow] Successfully translated batch ${batchIndex} (${Object.keys(object.translations).length} keys) for ${language.locale}`,
												);
												return object.translations;
											},
										);

										batchPromises.push(batchPromise);
									}

									// Execute all batches in parallel and merge results
									const batchResults = await Promise.all(batchPromises);
									const allTranslatedValues: Record<string, string> = {};

									for (const batchResult of batchResults) {
										Object.assign(allTranslatedValues, batchResult);
									}

									console.log(
										`[AITranslateWorkflow] Successfully translated ${Object.keys(allTranslatedValues).length} keys for ${language.locale}`,
									);

									return {
										language,
										translations: allTranslatedValues,
									};
								},
							);
						},
					),
				);

				console.log(
					`[AITranslateWorkflow] Completed parallel translation for ${results.length} languages`,
				);
				return results;
			},
		);

		// Step 4: Ensure draft version exists with idempotency (only after successful translations)
		await step.do(
			'ensure draft version exists',
			{
				retries: {
					limit: 3,
					delay: '2 seconds',
					backoff: 'exponential',
				},
				timeout: '30 seconds',
			},
			async () => {
				console.log(
					'[AITranslateWorkflow] Ensuring draft version exists before saving translations',
				);

				const [draftVersion, liveVersion] = await Promise.all([
					getLatestVersion('draft'),
					getLatestVersion('live'),
				]);

				if (!draftVersion) {
					const description = liveVersion
						? `AI Translation (fork from ${liveVersion.id})`
						: `AI Translation (${new Date().toISOString().split('T')[0]})`;

					const newVersion = await createVersion(description, userId);
					console.log(
						`[AITranslateWorkflow] Created new draft version: ${newVersion.id}`,
					);
					return newVersion;
				} else {
					console.log(
						`[AITranslateWorkflow] Draft version already exists: ${draftVersion.id}`,
					);
					return draftVersion;
				}
			},
		);

		// Step 5: Bulk upsert translations for each language atomically
		const upsertResults = await step.do(
			'bulk upsert all translations',
			{
				retries: {
					limit: 5,
					delay: '3 seconds',
					backoff: 'exponential',
				},
				timeout: '5 minutes',
			},
			async () => {
				console.log(
					'[AITranslateWorkflow] Starting bulk upsert for all translated languages',
				);

				let totalTranslated = 0;
				const results: Array<{ locale: string; count: number }> = [];

				for (const { language, translations } of allTranslationResults) {
					if (Object.keys(translations).length > 0) {
						console.log(
							`[AITranslateWorkflow] Bulk upserting ${Object.keys(translations).length} translations for ${language.locale}`,
						);

						await bulkUpsertTranslations(language.locale, translations);

						const count = Object.keys(translations).length;
						totalTranslated += count;
						results.push({ locale: language.locale, count });

						console.log(
							`[AITranslateWorkflow] Successfully upserted ${count} translations for ${language.locale}`,
						);
					}
				}

				console.log(
					`[AITranslateWorkflow] Bulk upsert completed. Total translations: ${totalTranslated}`,
				);
				return { totalTranslated, results };
			},
		);

		console.log(
			`[AITranslateWorkflow] AI translation workflow completed successfully. Total translations: ${upsertResults.totalTranslated}`,
		);
	}
}
