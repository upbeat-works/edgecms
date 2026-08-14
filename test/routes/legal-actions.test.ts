import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action as createAction } from '~/routes/edge-cms/legal/legal.new';
import {
	action as documentAction,
	loader as documentLoader,
} from '~/routes/edge-cms/legal/legal.$id';
import {
	getLanguages,
	getLegalDocumentBySlug,
	markLegalReleaseFailed,
} from '~/utils/db.server';
import { createLegalDocument } from '~/utils/services/legal.server';
import { authedRequest, resetDb, seedLanguage, signIn } from '../helpers';

let cookie: string;
let restoreWorkflowSpy: () => void;

beforeEach(async () => {
	await resetDb();
	cookie = await signIn();
	const workflowSpy = vi
		.spyOn(env.LEGAL_RELEASE_WORKFLOW, 'create')
		.mockResolvedValue({
			id: 'legal-route-publish',
		} as never);
	restoreWorkflowSpy = () => workflowSpy.mockRestore();
});

afterEach(() => restoreWorkflowSpy());

function form(fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return body;
}

async function createPrivacyPolicy() {
	const response = await createAction({
		request: authedRequest('/edge-cms/legal/new', cookie, {
			method: 'POST',
			body: form({
				name: 'Privacy Policy',
				type: 'privacy_policy',
			}),
		}),
	} as never);
	if (!(response instanceof Response)) {
		throw new Error('Expected a redirect response');
	}
	const document = await getLegalDocumentBySlug('privacy-policy');
	if (!document) throw new Error('Expected legal document');
	return { document, response };
}

function submit(documentId: number, fields: Record<string, string>) {
	return documentAction({
		request: authedRequest(`/edge-cms/legal/${documentId}`, cookie, {
			method: 'POST',
			body: form(fields),
		}),
		params: { id: documentId.toString() },
	} as never);
}

describe('legal document administration', () => {
	it('requires a signed-in user', async () => {
		await expect(
			documentLoader({
				request: new Request('https://cms.test/edge-cms/legal/1'),
				params: { id: '1' },
			} as never),
		).rejects.toMatchObject({ status: 302 });
	});

	it('creates a document and redirects its editor to the stable slug record', async () => {
		const { document, response } = await createPrivacyPolicy();

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(
			`/edge-cms/legal/${document.id}`,
		);
		expect(document).toMatchObject({
			name: 'Privacy Policy',
			slug: 'privacy-policy',
			type: 'privacy_policy',
		});
		await expect(getLanguages()).resolves.toEqual([
			{ locale: 'en', default: true },
		]);
	});

	it('starts existing documents in English when no language exists', async () => {
		const created = await createLegalDocument({
			name: 'Terms',
			slug: 'terms',
			type: 'terms_and_conditions',
		});
		if (!created.ok) throw new Error(created.error.message);

		const response = await submit(created.data.id, {
			intent: 'start-writing',
		});

		expect(response.status).toBe(200);
		await expect(getLanguages()).resolves.toEqual([
			{ locale: 'en', default: true },
		]);
	});

	it('preserves the generated slug when document details change', async () => {
		const { document } = await createPrivacyPolicy();

		const response = await submit(document.id, {
			intent: 'update-document',
			name: 'Customer Privacy Notice',
			type: 'privacy_policy',
		});

		expect(response.status).toBe(200);
		await expect(
			getLegalDocumentBySlug('privacy-policy'),
		).resolves.toMatchObject({
			name: 'Customer Privacy Notice',
			slug: 'privacy-policy',
		});
	});

	it('round-trips the exact locale draft through the editor route', async () => {
		await seedLanguage('en', true);
		const { document } = await createPrivacyPolicy();
		const markdown = '# Privacy\r\n\r\n  Your choices remain yours.  \n';

		const response = await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown,
		});
		expect(response.status).toBe(200);

		const data = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		expect(data).toMatchObject({
			document: { id: document.id },
			drafts: [{ locale: 'en', markdown }],
		});
	});

	it("publishes the saved document under today's date", async () => {
		const { document } = await createPrivacyPolicy();
		await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown: '# Privacy',
		});

		const response = await submit(document.id, {
			intent: 'publish',
		});
		expect(response.status).toBe(202);
		const today = new Date().toISOString().slice(0, 10);

		const data = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		expect(data).toMatchObject({
			releases: [
				{
					version: today,
					effectiveDate: today,
					status: 'processing',
					workflowId: 'legal-route-publish',
				},
			],
			variants: [{ locale: 'en', releaseHash: null }],
		});
	});

	it('publishes more than one revision on the same date', async () => {
		const { document } = await createPrivacyPolicy();
		await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown: '# Privacy\n\nFirst revision.',
		});
		const first = await submit(document.id, { intent: 'publish' });
		expect(first.status).toBe(202);

		await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown: '# Privacy\n\nSecond revision.',
		});
		const second = await submit(document.id, { intent: 'publish' });

		expect(second.status).toBe(202);
		const data = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		const today = new Date().toISOString().slice(0, 10);
		expect(data.releases).toHaveLength(2);
		expect(data.releases.map(release => release.version)).toEqual([
			today,
			today,
		]);
		expect(
			data.variants
				.map(variant => JSON.parse(variant.payload).markdown as string)
				.sort(),
		).toEqual([
			'# Privacy\n\nFirst revision.',
			'# Privacy\n\nSecond revision.',
		]);
	});

	it('discards a failed publication from document history', async () => {
		const { document } = await createPrivacyPolicy();
		await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown: '# Privacy',
		});
		await submit(document.id, { intent: 'publish' });
		const before = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		const [release] = before.releases;
		await markLegalReleaseFailed(release.id, 'PDF rendering failed');

		const response = await submit(document.id, {
			intent: 'discard-release',
			releaseId: release.id.toString(),
		});

		expect(response.status).toBe(200);
		const after = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		expect(after.releases).toEqual([]);
	});
});
