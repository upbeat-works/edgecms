import { beforeEach, describe, expect, it } from 'vitest';
import { action as createDraft } from '~/routes/edge-cms/api/legal';
import { action as updateDraft } from '~/routes/edge-cms/api/legal.$id.drafts.$locale';
import {
	getLegalDocumentBySlug,
	getLegalDrafts,
	getLegalReleases,
} from '~/utils/db.server';
import { apiRequest, createApiKey, resetDb, seedLanguage } from '../helpers';

let apiKey: string;

beforeEach(async () => {
	await resetDb();
	apiKey = await createApiKey();
	await seedLanguage('en', true);
});

function create(body: unknown) {
	return createDraft({
		request: apiRequest('/edge-cms/api/legal', apiKey, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	});
}

function update(documentId: number, locale: string, body: unknown) {
	return updateDraft({
		request: apiRequest(
			`/edge-cms/api/legal/${documentId}/drafts/${locale}`,
			apiKey,
			{ method: 'PUT', body: JSON.stringify(body) },
		),
		params: { id: String(documentId), locale },
	});
}

describe('legal draft API', () => {
	it('creates a localized Markdown draft through the authenticated API', async () => {
		const markdown = '# Privacy\r\n\r\nYour choices stay yours.\n';
		const response = await create({
			name: 'Privacy Policy',
			type: 'privacy_policy',
			locale: 'en',
			markdown,
		});

		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body).toMatchObject({
			name: 'Privacy Policy',
			slug: 'privacy-policy',
			type: 'privacy_policy',
			locale: 'en',
			state: 'draft',
		});
		const document = await getLegalDocumentBySlug('privacy-policy');
		expect(document).toMatchObject({ id: body.id });
		await expect(getLegalDrafts(body.id)).resolves.toEqual([
			expect.objectContaining({ locale: 'en', markdown }),
		]);
	});

	it('updates one locale without publishing the legal document', async () => {
		const created = await create({
			name: 'Terms',
			slug: 'customer-terms',
			type: 'terms_and_conditions',
			locale: 'en',
			markdown: '# Terms\n\nFirst draft.',
		});
		const documentId = ((await created.json()) as { id: number }).id;

		const response = await update(documentId, 'en', {
			markdown: '# Terms\n\nSecond draft.',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			documentId,
			locale: 'en',
			state: 'draft',
		});
		await expect(getLegalDrafts(documentId)).resolves.toEqual([
			expect.objectContaining({
				locale: 'en',
				markdown: '# Terms\n\nSecond draft.',
			}),
		]);
		await expect(getLegalReleases(documentId)).resolves.toEqual([]);
	});

	it('does not leave a document behind when its locale is not configured', async () => {
		const response = await create({
			name: 'Spanish Privacy',
			type: 'privacy_policy',
			locale: 'es',
			markdown: '# Privacidad',
		});

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			code: 'LOCALE_NOT_FOUND',
		});
		await expect(getLegalDocumentBySlug('spanish-privacy')).resolves.toBeNull();
	});

	it('rejects draft writes without an API key', async () => {
		const request = new Request('https://cms.test/edge-cms/api/legal', {
			method: 'POST',
			body: JSON.stringify({
				name: 'Privacy',
				type: 'privacy_policy',
				locale: 'en',
				markdown: '# Privacy',
			}),
		});

		await expect(createDraft({ request })).rejects.toMatchObject({
			status: 401,
		});
		await expect(getLegalDocumentBySlug('privacy')).resolves.toBeNull();

		const created = await create({
			name: 'Terms',
			type: 'terms_and_conditions',
			locale: 'en',
			markdown: '# Terms\n\nOriginal.',
		});
		const documentId = ((await created.json()) as { id: number }).id;
		const updateRequest = new Request(
			`https://cms.test/edge-cms/api/legal/${documentId}/drafts/en`,
			{
				method: 'PUT',
				body: JSON.stringify({ markdown: '# Replaced' }),
			},
		);

		await expect(
			updateDraft({
				request: updateRequest,
				params: { id: String(documentId), locale: 'en' },
			}),
		).rejects.toMatchObject({ status: 401 });
		await expect(getLegalDrafts(documentId)).resolves.toEqual([
			expect.objectContaining({ markdown: '# Terms\n\nOriginal.' }),
		]);
	});
});
