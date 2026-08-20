import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EdgeCMSConfig } from './config.js';

const STATE_FILENAME = '.edgecms-state.json';

interface PullState {
	formatVersion: 1;
	baseUrl: string;
	defaultLocale: string;
	revision: string;
}

function statePath(config: EdgeCMSConfig): string {
	return resolve(process.cwd(), config.localesDir, STATE_FILENAME);
}

export async function writePullState(
	config: EdgeCMSConfig,
	revision: string,
): Promise<void> {
	if (typeof revision !== 'string' || revision.length === 0) {
		throw new Error(
			'The EdgeCMS instance did not return a catalogue revision. Upgrade the instance before using conflict-safe pushes.',
		);
	}

	const state: PullState = {
		formatVersion: 1,
		baseUrl: config.baseUrl,
		defaultLocale: config.defaultLocale,
		revision,
	};

	await writeFile(
		statePath(config),
		`${JSON.stringify(state, null, 2)}\n`,
		'utf-8',
	);
}

export async function readPullRevision(config: EdgeCMSConfig): Promise<string> {
	let raw: string;
	try {
		raw = await readFile(statePath(config), 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(
				'No EdgeCMS pull state found. Preserve any local edits, run `edgecms pull --from draft`, then reconcile them before pushing.',
			);
		}
		throw error;
	}

	let state: unknown;
	try {
		state = JSON.parse(raw);
	} catch {
		throw new Error(
			`${statePath(config)} is not valid JSON. Pull again before pushing.`,
		);
	}

	if (
		typeof state !== 'object' ||
		state == null ||
		!('formatVersion' in state) ||
		state.formatVersion !== 1 ||
		!('baseUrl' in state) ||
		state.baseUrl !== config.baseUrl ||
		!('defaultLocale' in state) ||
		state.defaultLocale !== config.defaultLocale ||
		!('revision' in state) ||
		typeof state.revision !== 'string' ||
		state.revision.length === 0
	) {
		throw new Error(
			`${statePath(config)} does not match this EdgeCMS instance and default locale. Pull again before pushing.`,
		);
	}

	return state.revision;
}
