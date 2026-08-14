import puppeteer from '@cloudflare/puppeteer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegalPdfHtml, generateLegalPdf } from '~/utils/legal-pdf.server';
import type { LegalReleasePayload } from '~/utils/legal-release.server';

const launch = vi.spyOn(puppeteer, 'launch');

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
	beforeEach(() => {
		launch.mockReset();
	});

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

	it('renders self-contained HTML as an A4 PDF in Browser Run', async () => {
		const setJavaScriptEnabled = vi.fn().mockResolvedValue(undefined);
		const setRequestInterception = vi.fn().mockResolvedValue(undefined);
		const abort = vi.fn().mockResolvedValue(undefined);
		const on = vi.fn(
			(_event: string, listener: (request: { abort: typeof abort }) => void) =>
				listener({ abort }),
		);
		const setContent = vi.fn().mockResolvedValue(undefined);
		const pdf = vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
		const close = vi.fn().mockResolvedValue(undefined);
		launch.mockResolvedValue({
			newPage: vi.fn().mockResolvedValue({
				setJavaScriptEnabled,
				setRequestInterception,
				on,
				setContent,
				pdf,
			}),
			close,
		});
		const browserBinding = { fetch: vi.fn() } as unknown as Pick<
			BrowserRun,
			'fetch'
		>;

		const response = await generateLegalPdf(browserBinding, {
			payload,
			releaseHash: 'abc123',
			verificationUrl: 'https://cms.test/edge-cms/public/legal/privacy/en',
		});

		expect(response.ok).toBe(true);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([37, 80, 68, 70]),
		);
		expect(launch).toHaveBeenCalledWith(browserBinding);
		expect(setContent).toHaveBeenCalledWith(
			expect.stringContaining('Your data is yours.'),
		);
		expect(setJavaScriptEnabled).toHaveBeenCalledWith(false);
		expect(setRequestInterception).toHaveBeenCalledWith(true);
		expect(on).toHaveBeenCalledWith('request', expect.any(Function));
		expect(abort).toHaveBeenCalledOnce();
		expect(pdf).toHaveBeenCalledWith({
			format: 'a4',
			printBackground: true,
			preferCSSPageSize: true,
			tagged: true,
			outline: true,
		});
		expect(close).toHaveBeenCalledOnce();
	});

	it('closes the browser when PDF rendering fails', async () => {
		const close = vi.fn().mockResolvedValue(undefined);
		launch.mockResolvedValue({
			newPage: vi.fn().mockResolvedValue({
				setJavaScriptEnabled: vi.fn().mockResolvedValue(undefined),
				setRequestInterception: vi.fn().mockResolvedValue(undefined),
				on: vi.fn(),
				setContent: vi.fn().mockResolvedValue(undefined),
				pdf: vi.fn().mockRejectedValue(new Error('capacity exceeded')),
			}),
			close,
		});
		const browserBinding = { fetch: vi.fn() } as unknown as Pick<
			BrowserRun,
			'fetch'
		>;

		await expect(
			generateLegalPdf(browserBinding, {
				payload,
				releaseHash: 'abc123',
				verificationUrl: 'https://cms.test/edge-cms/public/legal/privacy/en',
			}),
		).rejects.toThrow('capacity exceeded');
		expect(close).toHaveBeenCalledOnce();
	});
});
