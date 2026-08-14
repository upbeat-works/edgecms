import { describe, expect, it } from 'vitest';
import {
	hashLegalReleasePayload,
	parseLegalSigningPrivateJwk,
	serializeLegalReleasePayload,
	signLegalReleasePayload,
	verifyLegalReleaseSignature,
	type LegalReleasePayload,
} from '~/utils/legal-release.server';

const payload: LegalReleasePayload = {
	documentId: 42,
	slug: 'terms',
	type: 'terms_and_conditions',
	locale: 'en',
	version: '2026-08',
	effectiveDate: '2026-09-01',
	markdown: '# Terms\n\nBe excellent to each other.\n',
};

describe('legal release evidence', () => {
	it('reports signing configuration errors without leaking JSON parser errors', () => {
		expect(() => parseLegalSigningPrivateJwk(undefined)).toThrow(
			'LEGAL_SIGNING_PRIVATE_JWK is not configured',
		);
		expect(() => parseLegalSigningPrivateJwk('undefined')).toThrow(
			'LEGAL_SIGNING_PRIVATE_JWK must contain valid JSON',
		);
	});

	it('serializes the signed fields in one stable representation', () => {
		expect(serializeLegalReleasePayload(payload)).toBe(
			'{"documentId":42,"slug":"terms","type":"terms_and_conditions","locale":"en","version":"2026-08","effectiveDate":"2026-09-01","markdown":"# Terms\\n\\nBe excellent to each other.\\n"}',
		);
	});

	it('identifies the complete locale release with one SHA-256 hash', async () => {
		const serialized = serializeLegalReleasePayload(payload);

		await expect(hashLegalReleasePayload(serialized)).resolves.toBe(
			'df2c48a75140496c51cca156e8c7489adfb2c61f0f2b1bc9bc55e00ca692f6ba',
		);

		const changedVersion = serializeLegalReleasePayload({
			...payload,
			version: '2026-09',
		});
		expect(await hashLegalReleasePayload(changedVersion)).not.toBe(
			await hashLegalReleasePayload(serialized),
		);
	});

	it('signs and verifies the same canonical payload', async () => {
		const keys = await crypto.subtle.generateKey(
			{ name: 'ECDSA', namedCurve: 'P-256' },
			true,
			['sign', 'verify'],
		);
		const privateJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
		const serialized = serializeLegalReleasePayload(payload);

		const signed = await signLegalReleasePayload(serialized, privateJwk);

		expect(signed.releaseHash).toBe(await hashLegalReleasePayload(serialized));
		expect(signed.signature).toEqual(expect.any(String));
		await expect(
			verifyLegalReleaseSignature(
				serialized,
				signed.signature,
				signed.publicJwk,
			),
		).resolves.toBe(true);
		await expect(
			verifyLegalReleaseSignature(
				serialized.replace('excellent', 'awful'),
				signed.signature,
				signed.publicJwk,
			),
		).resolves.toBe(false);
	});
});
