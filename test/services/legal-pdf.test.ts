import { describe, expect, it, vi } from 'vitest';
import { createLegalPdfHtml, generateLegalPdf } from '~/utils/legal-pdf.server';
import type { LegalReleasePayload } from '~/utils/legal-release.server';

const payload: LegalReleasePayload = {
	documentId: 7,
	slug: 'privacy',
	type: 'privacy_policy',
	locale: 'en',
	version: '3.1',
	effectiveDate: '2026-09-01',
	markdown: '# Privacy\n\nYour data is yours.\n\n<script>alert(1)</script>',
};

describe('legal PDF rendering', () => {
	it('renders sanitized Markdown with its release evidence', () => {
		const html = createLegalPdfHtml(
			payload,
			'abc123',
			'https://cms.test/edge-cms/public/legal/privacy/en',
		);

		expect(html).toContain('<h1>Privacy</h1>');
		expect(html).toContain('Your data is yours.');
		expect(html).not.toContain('<script>');
		expect(html).toContain('Release hash');
		expect(html).toContain('abc123');
		expect(html).toContain('2026-09-01');
		expect(html).toContain('https://cms.test/edge-cms/public/legal/privacy/en');
	});

	it('sends self-contained HTML to the Browser Rendering boundary', async () => {
		const quickAction = vi.fn().mockResolvedValue(
			new Response(new Uint8Array([37, 80, 68, 70]), {
				status: 200,
				headers: { 'Content-Type': 'application/pdf' },
			}),
		);

		const response = await generateLegalPdf(
			{ quickAction } as Pick<BrowserRun, 'quickAction'>,
			{
				payload,
				releaseHash: 'abc123',
				verificationUrl: 'https://cms.test/edge-cms/public/legal/privacy/en',
			},
		);

		expect(response.ok).toBe(true);
		expect(quickAction).toHaveBeenCalledWith(
			'pdf',
			expect.objectContaining({
				html: expect.stringContaining('Your data is yours.'),
				setJavaScriptEnabled: false,
				pdfOptions: expect.objectContaining({ format: 'a4' }),
			}),
		);
	});

	it('surfaces a renderer failure without creating a PDF response', async () => {
		const browser = {
			quickAction: vi
				.fn()
				.mockResolvedValue(new Response('capacity exceeded', { status: 503 })),
		} as Pick<BrowserRun, 'quickAction'>;

		await expect(
			generateLegalPdf(browser, {
				payload,
				releaseHash: 'abc123',
				verificationUrl: 'https://cms.test/edge-cms/public/legal/privacy/en',
			}),
		).rejects.toThrow('PDF rendering failed with status 503');
	});
});
