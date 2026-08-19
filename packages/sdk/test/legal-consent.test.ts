import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { EdgeCMSClient } from '../src/api.js';

const requests: Array<{
	method: string;
	path: string;
	query: string;
	body?: unknown;
}> = [];

const capability = {
	endpoint: '/edge-cms/consent/subjects',
	type: 'privacy_policy_privacy',
	documentSnapshotToken: 'signed.snapshot.token',
	expiresAt: '2026-08-19T13:15:00.000Z',
};

const server = setupServer(
	http.get('*/public/legal/:slug/:locale', ({ request }) => {
		const url = new URL(request.url);
		requests.push({
			method: request.method,
			path: url.pathname,
			query: url.search,
		});
		return HttpResponse.json({
			document: {
				id: 41,
				name: 'Privacy Policy',
				slug: 'privacy',
				type: 'privacy_policy',
			},
			release: {
				id: 9,
				version: '2026-08-19',
				effectiveDate: '2026-08-19',
				locale: 'en',
			},
			payload: {
				documentId: 41,
				slug: 'privacy',
				type: 'privacy_policy',
				locale: 'en',
				version: '2026-08-19',
				effectiveDate: '2026-08-19',
				markdown: '# Privacy',
			},
			canonicalPayload: '{"documentId":41}',
			releaseHash: 'release-hash',
			signature: 'signature',
			signatureAlgorithm: 'ES256',
			signingKeyId: 'legal-key-1',
			publicJwk: { kty: 'EC' },
			evidenceUrl: '/evidence',
			markdownUrl: '/evidence.md',
			pdfUrl: '/evidence.pdf',
			consent: capability,
		});
	}),
	http.post('*/consent/subjects', async ({ request }) => {
		const url = new URL(request.url);
		const body = (await request.json()) as {
			documentSnapshotToken?: string;
		};
		requests.push({
			method: request.method,
			path: url.pathname,
			query: url.search,
			body,
		});
		if (body.documentSnapshotToken === 'forged') {
			return HttpResponse.json(
				{
					code: 'LEGAL_DOCUMENT_SNAPSHOT_INVALID',
					message: 'Legal document snapshot token is invalid',
				},
				{ status: 409 },
			);
		}
		return HttpResponse.json({
			subjectId: 'sub_2jv6z8n4q9',
			consentId: 'cns_42',
			domainId: 'dom_42',
			domain: 'client.example',
			type: capability.type,
			metadata: { flow: 'signup' },
			givenAt: '2026-08-19T13:00:00.000Z',
		});
	}),
	http.get('*/consent/subjects/:subjectId', ({ request, params }) => {
		const url = new URL(request.url);
		requests.push({
			method: request.method,
			path: url.pathname,
			query: url.search,
		});
		return HttpResponse.json({
			subject: {
				id: params.subjectId,
				createdAt: '2026-08-19T13:00:00.000Z',
			},
			consents: [
				{
					id: 'cns_42',
					type: capability.type,
					policyHash: 'release-hash',
					isLatestPolicy: true,
					givenAt: '2026-08-19T13:00:00.000Z',
				},
			],
			isValid: true,
		});
	}),
);

beforeEach(() => {
	requests.length = 0;
	server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => server.close());

describe('legal consent SDK', () => {
	it('uses the rendered release capability to record and read consent', async () => {
		const client = new EdgeCMSClient({
			baseUrl: 'https://cms.test/edge-cms',
		});

		const document = await client.getLegalDocument('privacy notice', 'pt-BR');
		const receipt = await client.recordLegalConsent({
			type: document.consent.type,
			documentSnapshotToken: document.consent.documentSnapshotToken,
			subjectId: 'sub_2jv6z8n4q9',
			domain: 'client.example',
			metadata: { flow: 'signup' },
		});
		const status = await client.getLegalConsentStatus('sub_2jv6z8n4q9', {
			type: [document.consent.type, 'terms_and_conditions_terms'],
		});

		expect(receipt).toMatchObject({
			consentId: 'cns_42',
			metadata: { flow: 'signup' },
		});
		expect(status).toMatchObject({
			isValid: true,
			consents: [{ policyHash: 'release-hash' }],
		});
		expect(requests).toEqual([
			{
				method: 'GET',
				path: '/edge-cms/public/legal/privacy%20notice/pt-BR',
				query: '',
			},
			{
				method: 'POST',
				path: '/edge-cms/consent/subjects',
				query: '',
					body: {
						type: capability.type,
						documentSnapshotToken: capability.documentSnapshotToken,
						subjectId: 'sub_2jv6z8n4q9',
						domain: 'client.example',
						metadata: { flow: 'signup' },
					},
			},
			{
				method: 'GET',
				path: '/edge-cms/consent/subjects/sub_2jv6z8n4q9',
				query: '?type=privacy_policy_privacy%2Cterms_and_conditions_terms',
			},
		]);
	});

	it('preserves c15t error codes and messages', async () => {
		const client = new EdgeCMSClient({
			baseUrl: 'https://cms.test/edge-cms',
		});

		await expect(
			client.recordLegalConsent({
				type: capability.type,
				documentSnapshotToken: 'forged',
				subjectId: 'sub_2jv6z8n4q9',
				domain: 'client.example',
			}),
		).rejects.toMatchObject({
			name: 'EdgeCMSApiError',
			code: 'LEGAL_DOCUMENT_SNAPSHOT_INVALID',
			message: 'Legal document snapshot token is invalid',
			status: 409,
		});
	});
});
