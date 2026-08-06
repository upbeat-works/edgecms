import { describe, expect, it } from 'vitest';
import { describeWorkflowError } from '~/utils/services/publish.server';

/**
 * The Workflows runtime is not contractual about this field: miniflare hands
 * back a `WorkflowFatalError` object, while the documented shape is a string.
 * A release that fails must report *why* under either, so this covers the
 * shapes the integration test can't produce locally.
 */
describe('describing a failed release', () => {
	it('passes a string reason through', () => {
		expect(describeWorkflowError('No default language found')).toBe(
			'No default language found',
		);
	});

	it('unwraps the message from an Error', () => {
		expect(describeWorkflowError(new Error('No default language found'))).toBe(
			'No default language found',
		);
	});

	it('reads message off a plain object', () => {
		expect(describeWorkflowError({ message: 'step timed out' })).toBe(
			'step timed out',
		);
	});

	it('falls back to a description for an unrecognised shape', () => {
		expect(describeWorkflowError(42)).toBe('42');
	});

	it('reports no reason when there is none', () => {
		expect(describeWorkflowError(null)).toBeNull();
		expect(describeWorkflowError(undefined)).toBeNull();
	});
});
