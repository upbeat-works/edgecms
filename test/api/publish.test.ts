import { env, introspectWorkflow } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from '~/routes/edge-cms/api/publish';
import {
	createVersion,
	getLatestVersion,
	releaseDraft,
} from '~/utils/db/versions.server';
import { upsertTranslation } from '~/utils/db/translations.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
	vi.restoreAllMocks();
});

function publish() {
	return action({
		request: apiRequest('/edge-cms/api/publish', apiKey, { method: 'POST' }),
	} as never);
}

function status(id?: string) {
	const query = id == null ? '' : `?id=${encodeURIComponent(id)}`;
	return loader({
		request: apiRequest(`/edge-cms/api/publish${query}`, apiKey),
	} as never);
}

async function introspectedInstance(
	workflow: Awaited<ReturnType<typeof introspectWorkflow>>,
) {
	const instances = await workflow.get();
	if (instances.length !== 1) {
		throw new Error(`Expected one publish instance, got ${instances.length}`);
	}
	return instances[0];
}

describe('publishing a draft', () => {
	it('makes the draft live and writes the published locale files', async () => {
		await using _workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.title', 'es', 'Bienvenido');
		const draft = await createVersion('some changes');

		const response = await publish();
		expect(response.status).toBe(202);
		const { publishId, versionId } = (await response.json()) as {
			publishId: string;
			versionId: number;
		};
		expect(publishId).toEqual(expect.any(String));
		expect(versionId).toBe(draft.id);

		const instance = await introspectedInstance(_workflow);
		await instance.waitForStatus('complete');

		// The draft is now the live version...
		expect(await getLatestVersion('live')).toMatchObject({ id: draft.id });
		expect(await getLatestVersion('draft')).toBeNull();

		// ...and the locale files the public endpoint serves are in R2.
		const published = await env.BACKUPS_BUCKET.get(`${draft.id}/en.json`);
		await expect(published?.json()).resolves.toEqual({
			'home.title': 'Welcome',
		});
		const spanish = await env.BACKUPS_BUCKET.get(`${draft.id}/es.json`);
		await expect(spanish?.json()).resolves.toEqual({
			'home.title': 'Bienvenido',
		});
	});

	it('falls back to the default locale for keys a locale has not translated', async () => {
		await using _workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.cta', 'en', 'Sign up');
		await upsertTranslation('home.title', 'es', 'Bienvenido');
		const draft = await createVersion('some changes');

		const { publishId } = (await publish().then(r => r.json())) as {
			publishId: string;
		};
		expect(publishId).toEqual(expect.any(String));
		const instance = await introspectedInstance(_workflow);
		await instance.waitForStatus('complete');

		const spanish = await env.BACKUPS_BUCKET.get(`${draft.id}/es.json`);
		await expect(spanish?.json()).resolves.toEqual({
			'home.title': 'Bienvenido',
			'home.cta': 'Sign up',
		});
	});

	it('refuses when there is nothing to publish', async () => {
		await seedLanguage('en', true);

		const response = await publish();

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'NO_DRAFT',
		});
	});

	// The release workflow throws "No default language found" partway through,
	// which would otherwise surface as a 202 followed by a silent async failure.
	it('refuses before starting work when no default language is set', async () => {
		await seedLanguage('en', false);
		await createVersion('some changes');
		const create = vi.spyOn(env.RELEASE_VERSION_WORKFLOW, 'create');

		const response = await publish();

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'NO_DEFAULT_LANGUAGE',
		});
		expect(create).not.toHaveBeenCalled();
	});

	it('refuses when no languages exist at all', async () => {
		await createVersion('some changes');
		const create = vi.spyOn(env.RELEASE_VERSION_WORKFLOW, 'create');

		const response = await publish();

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: 'NO_LANGUAGES',
		});
		expect(create).not.toHaveBeenCalled();
	});

	it('leaves the draft in place when it refuses', async () => {
		await seedLanguage('en', false);
		const draft = await createVersion('some changes');

		await publish();

		expect(await getLatestVersion('draft')).toMatchObject({ id: draft.id });
	});
});

describe('publish status', () => {
	it('tracks a real release through to completion', async () => {
		await using _workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('some changes');

		const { publishId } = (await publish().then(r => r.json())) as {
			publishId: string;
		};
		expect(publishId).toEqual(expect.any(String));

		const instance = await introspectedInstance(_workflow);
		await expect(instance.waitForStatus('complete')).resolves.toBeUndefined();
	});

	it('reports a release that failed while running', async () => {
		await using workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		await workflow.modifyAll(async modifier => {
			await modifier.disableRetryDelays();
		});
		await seedLanguage('en', false); // no default -> workflow throws
		await createVersion('some changes');
		await releaseDraft();

		const instance = await introspectedInstance(workflow);
		await instance.waitForStatus('errored');
		await expect(instance.getError()).resolves.toMatchObject({
			message: expect.stringContaining('No default language found'),
		});
	}, 45_000);

	it('requires an id', async () => {
		const response = await status();

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			code: 'VALIDATION_ERROR',
		});
	});

	// Runs against the real Workflows binding rather than a stub, so it proves
	// the actual contract: `get()` on an unknown id rejects. Miniflare logs a
	// few internal "Engine was never started" / "instance.not_found" rejections
	// while doing so — noise, not failures.
	it('404s for an unknown publish id', async () => {
		await using _workflow = await introspectWorkflow(
			env.RELEASE_VERSION_WORKFLOW,
		);
		const response = await status('does-not-exist');

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'PUBLISH_NOT_FOUND',
		});
	});
});

describe('authentication', () => {
	it('rejects publishing without an API key', async () => {
		const request = new Request('https://cms.test/edge-cms/api/publish', {
			method: 'POST',
		});

		await expect(action({ request } as never)).rejects.toMatchObject({
			status: 401,
		});
	});

	it('rejects unsupported methods', async () => {
		const response = await action({
			request: apiRequest('/edge-cms/api/publish', apiKey, {
				method: 'DELETE',
			}),
		} as never);

		expect(response.status).toBe(405);
	});
});
