import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from 'cloudflare:workers';
import {
	getLegalDocumentById,
	getLegalReleaseById,
	getLegalReleaseVariants,
	markLegalReleaseFailed,
	markLegalReleasePublished,
	saveLegalReleaseVariantArtifacts,
} from '~/utils/db.server';
import {
	parseLegalReleasePayload,
	parseLegalSigningPrivateJwk,
	signLegalReleasePayload,
} from '~/utils/legal-release.server';
import { generateLegalPdf } from '~/utils/legal-pdf.server';

export interface LegalReleaseWorkflowParams {
	releaseId: number;
}

interface LegalReleaseEnv extends Env {
	LEGAL_SIGNING_PRIVATE_JWK: string;
}

function verificationUrl(
	baseUrl: string,
	slug: string,
	locale: string,
): string {
	return `${baseUrl.replace(/\/$/u, '')}/edge-cms/public/legal/${encodeURIComponent(slug)}/${encodeURIComponent(locale)}`;
}

function pdfKey(input: {
	documentId: number;
	releaseId: number;
	version: string;
	locale: string;
}): string {
	return [
		'legal',
		input.documentId,
		input.releaseId,
		encodeURIComponent(input.version),
		`${encodeURIComponent(input.locale)}.pdf`,
	].join('/');
}

export class LegalReleaseWorkflow extends WorkflowEntrypoint<
	LegalReleaseEnv,
	LegalReleaseWorkflowParams
> {
	async run(
		event: WorkflowEvent<LegalReleaseWorkflowParams>,
		step: WorkflowStep,
	): Promise<void> {
		try {
			const snapshot = await step.do(
				'load frozen legal release',
				{
					retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
					timeout: '30 seconds',
				},
				async () => {
					const release = await getLegalReleaseById(event.payload.releaseId);
					if (!release) throw new Error('Legal release not found');
					if (release.status !== 'processing') {
						throw new Error(
							`Legal release is ${release.status}, not processing`,
						);
					}
					const [document, variants] = await Promise.all([
						getLegalDocumentById(release.documentId),
						getLegalReleaseVariants(release.id),
					]);
					if (!document) throw new Error('Legal document not found');
					if (variants.length === 0) {
						throw new Error('Legal release has no locale variants');
					}
					return {
						documentId: document.id,
						releaseId: release.id,
						version: release.version,
						variants: variants.map(variant => ({
							id: variant.id,
							locale: variant.locale,
							payload: variant.payload,
							releaseHash: variant.releaseHash,
							signature: variant.signature,
							signingKeyId: variant.signingKeyId,
							publicJwk: variant.publicJwk,
							pdfKey: variant.pdfKey,
						})),
					};
				},
			);

			const signingKeyId = this.env.LEGAL_SIGNING_KEY_ID.trim();
			if (!signingKeyId)
				throw new Error('LEGAL_SIGNING_KEY_ID is not configured');
			const privateJwk = parseLegalSigningPrivateJwk(
				this.env.LEGAL_SIGNING_PRIVATE_JWK,
			);

			for (const variant of snapshot.variants) {
				await step.do(
					`publish legal variant ${variant.id}`,
					{
						retries: {
							limit: 5,
							delay: '3 seconds',
							backoff: 'exponential',
						},
						timeout: '2 minutes',
					},
					async () => {
						const key = pdfKey({
							documentId: snapshot.documentId,
							releaseId: snapshot.releaseId,
							version: snapshot.version,
							locale: variant.locale,
						});
						if (
							variant.releaseHash &&
							variant.signature &&
							variant.signingKeyId &&
							variant.publicJwk &&
							variant.pdfKey &&
							(await this.env.MEDIA_BUCKET.head(variant.pdfKey))
						) {
							return {
								variantId: variant.id,
								releaseHash: variant.releaseHash,
							};
						}

						const payload = parseLegalReleasePayload(variant.payload);
						const signed = await signLegalReleasePayload(
							variant.payload,
							privateJwk,
						);
						if (!(await this.env.MEDIA_BUCKET.head(key))) {
							const pdf = await generateLegalPdf(this.env.BROWSER, {
								payload,
								releaseHash: signed.releaseHash,
								verificationUrl: verificationUrl(
									this.env.BASE_URL,
									payload.slug,
									payload.locale,
								),
							});
							if (!pdf.body)
								throw new Error('PDF renderer returned an empty body');
							await this.env.MEDIA_BUCKET.put(key, pdf.body, {
								httpMetadata: {
									contentType: 'application/pdf',
									cacheControl: 'public, immutable, max-age=31536000',
								},
								customMetadata: { releaseHash: signed.releaseHash },
							});
						}
						await saveLegalReleaseVariantArtifacts({
							variantId: variant.id,
							releaseHash: signed.releaseHash,
							signature: signed.signature,
							signingKeyId,
							publicJwk: JSON.stringify(signed.publicJwk),
							pdfKey: key,
						});
						return { variantId: variant.id, releaseHash: signed.releaseHash };
					},
				);
			}

			await step.do(
				'mark legal release published',
				{
					retries: { limit: 5, delay: '2 seconds', backoff: 'exponential' },
					timeout: '30 seconds',
				},
				() => markLegalReleasePublished(snapshot.releaseId),
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			await step.do(
				'mark legal release failed',
				{ retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' } },
				() => markLegalReleaseFailed(event.payload.releaseId, reason),
			);
			throw error;
		}
	}
}
