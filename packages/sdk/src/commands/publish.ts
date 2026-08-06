import type { EdgeCMSConfig } from '../config.js';
import { EdgeCMSClient } from '../api.js';

const TERMINAL_STATES = ['complete', 'errored', 'terminated'];

export interface PublishOptions {
	/** Poll until the release settles instead of returning immediately. */
	wait?: boolean;
	/** How long to poll before giving up, in milliseconds. */
	timeoutMs?: number;
	/** Delay between polls, in milliseconds. */
	pollIntervalMs?: number;
}

/**
 * Release the current draft, optionally waiting for it to finish.
 *
 * Throws when the release ends in a non-`complete` state so CI fails loudly
 * rather than continuing against content that never went live.
 */
export async function publish(
	config: EdgeCMSConfig,
	options: PublishOptions = {},
): Promise<void> {
	const client = new EdgeCMSClient(config);

	const { publishId, versionId } = await client.publish();
	console.log(`Publishing version ${versionId} (${publishId})...`);

	if (!options.wait) {
		console.log(
			'\nRelease started. Check progress with: edgecms publish:status ' +
				publishId,
		);
		return;
	}

	const status = await waitForPublish(client, publishId, options);

	if (status.status !== 'complete') {
		throw new Error(
			`Publish ${status.status}${status.error ? `: ${status.error}` : ''}`,
		);
	}

	console.log('\nPublish complete. Content is live.');
}

async function waitForPublish(
	client: EdgeCMSClient,
	publishId: string,
	options: PublishOptions,
) {
	const timeoutMs = options.timeoutMs ?? 5 * 60_000;
	const pollIntervalMs = options.pollIntervalMs ?? 2_000;
	const deadline = Date.now() + timeoutMs;

	let lastStatus = '';
	while (Date.now() < deadline) {
		const status = await client.getPublishStatus(publishId);

		if (status.status !== lastStatus) {
			console.log(`  ${status.status}`);
			lastStatus = status.status;
		}

		if (TERMINAL_STATES.includes(status.status)) return status;

		await new Promise(r => setTimeout(r, pollIntervalMs));
	}

	throw new Error(
		`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for publish ${publishId}. ` +
			`It may still complete; check with: edgecms publish:status ${publishId}`,
	);
}

export async function publishStatus(
	config: EdgeCMSConfig,
	publishId: string,
): Promise<void> {
	const client = new EdgeCMSClient(config);
	const status = await client.getPublishStatus(publishId);

	console.log(`${status.publishId}: ${status.status}`);
	if (status.error) {
		console.log(`  ${status.error}`);
	}
}
