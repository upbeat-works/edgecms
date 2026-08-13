import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action as createAction } from '~/routes/edge-cms/legal/legal.new';
import {
	action as documentAction,
	loader as documentLoader,
} from '~/routes/edge-cms/legal/legal.$id';
import { getLegalDocumentBySlug } from '~/utils/db.server';
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
				slug: 'Privacy Policy',
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

	it('publishes a frozen release and exposes its lifecycle in the editor', async () => {
		await seedLanguage('en', true);
		const { document } = await createPrivacyPolicy();
		await submit(document.id, {
			intent: 'save-draft',
			locale: 'en',
			markdown: '# Privacy',
		});

		const response = await submit(document.id, {
			intent: 'publish',
			version: '1.0',
			effectiveDate: '2026-09-01',
		});
		expect(response.status).toBe(202);

		const data = await documentLoader({
			request: authedRequest(`/edge-cms/legal/${document.id}`, cookie),
			params: { id: document.id.toString() },
		} as never);
		expect(data).toMatchObject({
			releases: [
				{
					version: '1.0',
					status: 'processing',
					workflowId: 'legal-route-publish',
				},
			],
			variants: [{ locale: 'en', releaseHash: null }],
		});
	});
});
