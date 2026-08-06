import { env } from 'cloudflare:test';
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

const TERMINAL_STATES = ['complete', 'errored', 'terminated'];

// Note: each real release logs one unhandled `TypeError: The RPC receiver does
// not implement the method "entries"` from miniflare's Workflows engine. It has
// no frame in our code, fires once per run regardless of step count, and does
// not stop the workflow — the assertions below confirm every step's effect
// landed. `getAllBlockCollectionsData()`/`getBlocksBackupData()` were checked
// separately and are structured-cloneable.

/**
 * Drive a real release to completion. The workflow has no sleeps, so it settles
 * quickly; polling the public status endpoint (rather than the binding) means
 * the wait exercises the same path a CI client would use.
 */
async function awaitPublish(publishId: string, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const body = (await status(publishId).then(r => r.json())) as {
			status: string;
			error: string | null;
		};
		if (TERMINAL_STATES.includes(body.status)) return body;
		await scheduler.wait(50);
	}

	throw new Error(`Publish ${publishId} did not settle within ${timeoutMs}ms`);
}

describe('publishing a draft', () => {
	it('makes the draft live and writes the published locale files', async () => {
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
		expect(versionId).toBe(draft.id);

		const settled = await awaitPublish(publishId);
		expect(settled).toMatchObject({ status: 'complete', error: null });

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
		await seedLanguage('en', true);
		await seedLanguage('es', false);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await upsertTranslation('home.cta', 'en', 'Sign up');
		await upsertTranslation('home.title', 'es', 'Bienvenido');
		const draft = await createVersion('some changes');

		const { publishId } = (await publish().then(r => r.json())) as {
			publishId: string;
		};
		await awaitPublish(publishId);

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

describe('polling publish status', () => {
	it('tracks a real release through to completion', async () => {
		await seedLanguage('en', true);
		await upsertTranslation('home.title', 'en', 'Welcome');
		await createVersion('some changes');

		const { publishId } = (await publish().then(r => r.json())) as {
			publishId: string;
		};

		const response = await status(publishId);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { publishId: string };
		expect(body.publishId).toBe(publishId);

		await expect(awaitPublish(publishId)).resolves.toMatchObject({
			status: 'complete',
		});
	});

	// Bypasses the endpoint's precondition check by starting the workflow
	// directly, so the release genuinely fails mid-flight. Proves a failed
	// release is reported as `errored` with a JSON-safe `error` field, rather
	// than crashing the status endpoint on whatever shape Workflows hands back.
	// Slow by nature: the failing step retries 3x with exponential backoff before
	// the workflow gives up, so this takes ~15s. Kept anyway — it is the only
	// test proving a broken release surfaces as a failure CI can act on, rather
	// than hanging or crashing the status endpoint.
	it('reports a release that failed while running', async () => {
		await seedLanguage('en', false); // no default -> workflow throws
		await createVersion('some changes');
		const publishId = await releaseDraft();

		const settled = await awaitPublish(publishId, 40_000);

		expect(settled.status).toBe('errored');
		// Workflows reports the failure as an Error object, not a string. CI
		// needs the reason, not just "it failed".
		expect(settled.error).toContain('No default language found');
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
