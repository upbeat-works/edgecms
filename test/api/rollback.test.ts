import { env, introspectWorkflow } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getDefaultLocale,
	getLanguages,
	setDefaultLanguage,
} from '~/utils/db/languages.server';
import { createSection } from '~/utils/db/sections.server';
import {
	createLegalDocument,
	publishLegalDocument,
	saveLegalDraft,
} from '~/utils/services/legal.server';
import {
	deleteTranslationsByKeys,
	getTranslations,
	upsertTranslation,
} from '~/utils/db/translations.server';
import {
	createVersion,
	getLatestVersion,
	releaseDraft,
	rollbackVersion,
} from '~/utils/db/versions.server';
import { resetDb, seedLanguage } from '../helpers';

beforeEach(resetDb);

type Workflow = Awaited<ReturnType<typeof introspectWorkflow>>;

async function onlyInstance(workflow: Workflow) {
	const instances = await workflow.get();
	if (instances.length !== 1) {
		throw new Error(`Expected one instance, got ${instances.length}`);
	}
	return instances[0];
}

/** Publish the current draft and wait for the release to land. */
async function release(workflow: Workflow) {
	const draft = await getLatestVersion('draft');
	await releaseDraft();
	await (await onlyInstance(workflow)).waitForStatus('complete');
	return draft!;
}

/**
 * Archive a live version without publishing over it. Rollback only accepts an
 * archived version, and a second real release costs another workflow run.
 */
async function archive(versionId: number) {
	await env.DB.prepare(`UPDATE versions SET status = 'archived' WHERE id = ?`)
		.bind(versionId)
		.run();
}

describe('rolling a version back', () => {
	it('restores the catalogue as the version left it', async () => {
		await using releasing = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await using rollingBack = await introspectWorkflow(
			env.ROLLBACK_VERSION_WORKFLOW,
		);

		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await createSection('homepage');
		await upsertTranslation('home.title', 'en', 'Welcome', 'homepage');
		await upsertTranslation('home.title', 'es', 'Bienvenido', 'homepage');
		await createVersion('first');

		const published = await release(releasing);
		await archive(published.id);

		// Everything an editor might do between the release and the rollback.
		await createVersion('later changes');
		await upsertTranslation('home.title', 'en', 'Welcome back');
		await upsertTranslation('home.tagline', 'en', 'Added later');
		await deleteTranslationsByKeys(['home.title']);

		await rollbackVersion(published.id);
		await (await onlyInstance(rollingBack)).waitForStatus('complete');

		const rows = await getTranslations({});
		expect(
			Object.fromEntries(rows.map(row => [row.language, row.value])),
		).toEqual({ en: 'Welcome', es: 'Bienvenido' });
		// The deleted key came back, and so did the section it belongs to.
		expect(rows[0].section).toBe('homepage');
		expect(await getLatestVersion('live')).toMatchObject({
			id: published.id,
		});
	}, 45_000);

	it('restores the locale everything was translated from', async () => {
		await using releasing = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await using rollingBack = await introspectWorkflow(
			env.ROLLBACK_VERSION_WORKFLOW,
		);

		await seedLanguage('en', true);
		await seedLanguage('es', false);
		// The default locale holds nothing of its own, so a backup recording it
		// only by position would lose it and promote Spanish instead.
		await upsertTranslation('home.title', 'es', 'Bienvenido');
		await createVersion('first');

		const published = await release(releasing);
		await archive(published.id);

		await createVersion('later changes');
		await setDefaultLanguage('es');

		await rollbackVersion(published.id);
		await (await onlyInstance(rollingBack)).waitForStatus('complete');

		await expect(getDefaultLocale()).resolves.toBe('en');
		expect((await getLanguages()).map(l => l.locale).sort()).toEqual([
			'en',
			'es',
		]);
	}, 45_000);

	it('restores content without disturbing an immutable legal release', async () => {
		await using releasing = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await using rollingBack = await introspectWorkflow(
			env.ROLLBACK_VERSION_WORKFLOW,
		);
		await rollingBack.modifyAll(async modifier => {
			await modifier.disableRetryDelays();
		});

		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('first');
		const published = await release(releasing);
		await archive(published.id);

		const document = await createLegalDocument({
			name: 'Privacy Policy',
			slug: 'privacy',
			type: 'privacy_policy',
		});
		if (!document.ok) throw new Error(document.error.message);
		await saveLegalDraft({
			documentId: document.data.id,
			locale: 'en',
			markdown: '# Privacy',
		});
		const legalWorkflow = vi
			.spyOn(env.LEGAL_RELEASE_WORKFLOW, 'create')
			.mockResolvedValue({ id: 'legal-publish-test' } as never);
		const legalRelease = await publishLegalDocument({
			documentId: document.data.id,
			version: '2026-08',
			effectiveDate: '2026-08-19',
		}).finally(() => legalWorkflow.mockRestore());
		if (!legalRelease.ok) throw new Error(legalRelease.error.message);

		await createVersion('later changes');
		await upsertTranslation('home.title', 'en', 'Welcome back');

		await rollbackVersion(published.id);
		await (await onlyInstance(rollingBack)).waitForStatus('complete');

		await expect(getTranslations({})).resolves.toMatchObject([
			{ key: 'home.title', language: 'en', value: 'Welcome' },
		]);
		const variants = await env.DB.prepare(
			'SELECT locale FROM legal_release_variants WHERE releaseId = ?',
		)
			.bind(legalRelease.data.releaseId)
			.all<{ locale: string }>();
		expect(variants.results).toEqual([{ locale: 'en' }]);
	}, 45_000);

	it('leaves the catalogue alone when the backup is missing', async () => {
		await using rollingBack = await introspectWorkflow(
			env.ROLLBACK_VERSION_WORKFLOW,
		);
		await rollingBack.modifyAll(async modifier => {
			await modifier.disableRetryDelays();
		});

		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		const version = await createVersion('never released');
		await archive(version.id);

		await rollbackVersion(version.id);
		await (await onlyInstance(rollingBack)).waitForStatus('errored');

		// The wipe and the restore are one step, so failing to read the backup
		// must not have emptied anything.
		expect(await getTranslations({})).toHaveLength(1);
		await expect(getDefaultLocale()).resolves.toBe('en');
	}, 45_000);
});
