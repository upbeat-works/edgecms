import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { LegalReleasePayload } from './legal-release.server';

const PDF_STYLES = `
@page { size: A4; margin: 22mm 18mm 25mm; }
* { box-sizing: border-box; }
html { color: #172033; background: #fff; font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; }
body { margin: 0; font-size: 10.5pt; line-height: 1.62; }
main { max-width: 174mm; margin: 0 auto; }
.release-mark { width: 44px; height: 5px; margin-bottom: 13mm; background: #0284c7; }
.document { overflow-wrap: anywhere; }
.document h1 { margin: 0 0 10mm; color: #0f172a; font-size: 25pt; line-height: 1.08; letter-spacing: -0.025em; }
.document h2 { margin: 9mm 0 3mm; color: #0f172a; font-size: 16pt; line-height: 1.2; page-break-after: avoid; }
.document h3 { margin: 7mm 0 2.5mm; color: #0f172a; font-size: 12.5pt; page-break-after: avoid; }
.document p { margin: 0 0 4mm; }
.document li { margin-bottom: 1.5mm; }
.document a { color: #0369a1; }
.document blockquote { margin: 6mm 0; padding: 2mm 5mm; border-left: 2px solid #7dd3fc; color: #475569; }
.document table { width: 100%; border-collapse: collapse; margin: 6mm 0; font-size: 9pt; }
.document th, .document td { padding: 2.5mm; border: 1px solid #cbd5e1; text-align: left; vertical-align: top; }
.evidence { margin-top: 14mm; padding-top: 5mm; border-top: 1px solid #cbd5e1; color: #475569; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.5pt; line-height: 1.5; page-break-inside: avoid; }
.evidence dl { display: grid; grid-template-columns: 30mm 1fr; gap: 1.5mm 4mm; margin: 0; }
.evidence dt { color: #64748b; }
.evidence dd { margin: 0; overflow-wrap: anywhere; }
`;

function LegalPdfDocument({
	payload,
	releaseHash,
	verificationUrl,
}: {
	payload: LegalReleasePayload;
	releaseHash: string;
	verificationUrl: string;
}) {
	return (
		<html lang={payload.locale}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{`${payload.slug} ${payload.version}`}</title>
				<style>{PDF_STYLES}</style>
			</head>
			<body>
				<main>
					<div className="release-mark" />
					<article className="document">
						<ReactMarkdown rehypePlugins={[rehypeSanitize]}>
							{payload.markdown}
						</ReactMarkdown>
					</article>
					<section className="evidence" aria-label="Release evidence">
						<dl>
							<dt>Version</dt>
							<dd>{payload.version}</dd>
							<dt>Effective date</dt>
							<dd>{payload.effectiveDate}</dd>
							<dt>Locale</dt>
							<dd>{payload.locale}</dd>
							<dt>Release hash</dt>
							<dd>{releaseHash}</dd>
							<dt>Verify</dt>
							<dd>{verificationUrl}</dd>
						</dl>
					</section>
				</main>
			</body>
		</html>
	);
}

export function createLegalPdfHtml(
	payload: LegalReleasePayload,
	releaseHash: string,
	verificationUrl: string,
): string {
	return `<!doctype html>${renderToStaticMarkup(
		<LegalPdfDocument
			payload={payload}
			releaseHash={releaseHash}
			verificationUrl={verificationUrl}
		/>,
	)}`;
}

export async function generateLegalPdf(
	browser: Pick<BrowserRun, 'quickAction'>,
	input: {
		payload: LegalReleasePayload;
		releaseHash: string;
		verificationUrl: string;
	},
): Promise<Response> {
	const response = await browser.quickAction('pdf', {
		html: createLegalPdfHtml(
			input.payload,
			input.releaseHash,
			input.verificationUrl,
		),
		setJavaScriptEnabled: false,
		rejectResourceTypes: [
			'image',
			'media',
			'font',
			'script',
			'xhr',
			'fetch',
			'websocket',
		],
		cacheTTL: 0,
		pdfOptions: {
			format: 'a4',
			printBackground: true,
			preferCSSPageSize: true,
			tagged: true,
			outline: true,
		},
	});
	if (!response.ok) {
		throw new Error(`PDF rendering failed with status ${response.status}`);
	}
	return response;
}
