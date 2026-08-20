import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const removedTables = [
	'c15t_auditLog',
	'c15t_consent',
	'c15t_consentPolicy',
	'c15t_consentPurpose',
	'c15t_domain',
	'c15t_runtimePolicyDecision',
	'c15t_subject',
	'legal_document_drafts',
	'legal_documents',
	'legal_release_variants',
	'legal_releases',
	'private_c15t_settings',
];

describe('legal contract storage removal', () => {
	it('leaves no legal or c15t tables after all migrations run', async () => {
		const placeholders = removedTables.map(() => '?').join(', ');
		const result = await env.DB.prepare(
			`SELECT name FROM sqlite_master
			 WHERE type = 'table' AND name IN (${placeholders})
			 ORDER BY name`,
		)
			.bind(...removedTables)
			.all<{ name: string }>();

		expect(result.results).toEqual([]);
	});
});
