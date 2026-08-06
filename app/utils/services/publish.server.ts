import { getLanguages } from '../db/languages.server';
import {
	getLatestVersion,
	getReleaseInstance,
	releaseDraft,
} from '../db/versions.server';
import { err, ok, type ServiceResult } from './result';

export interface PublishResult {
	publishId: string;
	versionId: number;
}

export interface PublishStatusResult {
	publishId: string;
	status: string;
	error: string | null;
}

/**
 * Release the current draft version.
 *
 * The release Workflow validates the same preconditions internally, but it does
 * so *after* the instance is created — so a caller would get a success response
 * and only discover the failure by polling. We check them up front instead, and
 * refuse synchronously.
 */
export async function publishDraft(
	_options: { userId?: string } = {},
): Promise<ServiceResult<PublishResult>> {
	const draft = await getLatestVersion('draft');
	if (draft == null) {
		return err(
			'NO_DRAFT',
			'There is nothing to publish: no draft version exists',
			409,
		);
	}

	const languages = await getLanguages();
	if (languages.length === 0) {
		return err(
			'NO_LANGUAGES',
			'Cannot publish: no languages have been created',
			409,
		);
	}

	if (!languages.some(l => l.default)) {
		return err(
			'NO_DEFAULT_LANGUAGE',
			'Cannot publish: no default language is set. Set one with PATCH /api/i18n/languages.',
			409,
		);
	}

	const publishId = await releaseDraft();

	return ok({ publishId, versionId: draft.id });
}

/**
 * Workflows reports a failure as an Error object (`WorkflowFatalError`), not a
 * string, so reading `error` directly would throw away the reason a release
 * failed. Handles both shapes since the runtime's is not contractual.
 */
export function describeWorkflowError(error: unknown): string | null {
	if (error == null) return null;
	if (typeof error === 'string') return error;
	if (
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return String(error);
}

export async function getPublishStatus(
	publishId: string,
): Promise<ServiceResult<PublishStatusResult>> {
	let instance;
	try {
		instance = await getReleaseInstance(publishId);
	} catch {
		// The Workflows binding throws when the instance id is unknown.
		return err('PUBLISH_NOT_FOUND', `No publish found for "${publishId}"`, 404);
	}

	const state = await instance.status();

	return ok({
		publishId,
		status: state.status,
		error: describeWorkflowError(state.error),
	});
}
