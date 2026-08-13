import { access, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { EdgeCMSClient, type MediaItem } from '../api.js';
import type { EdgeCMSConfig } from '../config.js';

export interface ListMediaOptions {
	search?: string;
	section?: string;
	state?: 'live' | 'archived';
	allVersions?: boolean;
}

function printMedia(item: MediaItem) {
	console.log(
		`${item.id}\t${item.filename}\tv${item.version}\t${item.state}\t${item.canonicalUrl}`,
	);
}

async function fileBlob(
	file: string,
): Promise<{ blob: Blob; filename: string }> {
	const path = resolve(process.cwd(), file);
	try {
		await access(path);
	} catch {
		throw new Error(`File not found: ${path}`);
	}
	const bytes = await readFile(path);
	const filename = basename(path);
	const mimeTypes: Record<string, string> = {
		'.avif': 'image/avif',
		'.gif': 'image/gif',
		'.jpeg': 'image/jpeg',
		'.jpg': 'image/jpeg',
		'.json': 'application/json',
		'.mp3': 'audio/mpeg',
		'.mp4': 'video/mp4',
		'.pdf': 'application/pdf',
		'.png': 'image/png',
		'.svg': 'image/svg+xml',
		'.txt': 'text/plain',
		'.wav': 'audio/wav',
		'.webm': 'video/webm',
		'.webp': 'image/webp',
	};
	return {
		blob: new Blob([new Uint8Array(bytes)], {
			type:
				mimeTypes[extname(filename).toLocaleLowerCase()] ??
				'application/octet-stream',
		}),
		filename,
	};
}

export async function listMedia(
	config: EdgeCMSConfig,
	options: ListMediaOptions = {},
) {
	const response = await new EdgeCMSClient(config).getMedia(options);
	for (const item of response.media) printMedia(item);
}

export async function uploadMediaFile(
	config: EdgeCMSConfig,
	file: string,
	options: { section?: string } = {},
) {
	const { blob, filename } = await fileBlob(file);
	printMedia(
		await new EdgeCMSClient(config).uploadMedia(
			blob,
			filename,
			options.section,
		),
	);
}

export async function replaceMediaFile(
	config: EdgeCMSConfig,
	mediaId: number,
	file: string,
) {
	const { blob, filename } = await fileBlob(file);
	printMedia(
		await new EdgeCMSClient(config).replaceMedia(mediaId, blob, filename),
	);
}

export async function renameMediaFile(
	config: EdgeCMSConfig,
	mediaId: number,
	filename: string,
) {
	printMedia(await new EdgeCMSClient(config).renameMedia(mediaId, filename));
}

export async function attachBlockMedia(
	config: EdgeCMSConfig,
	input: {
		collection: string;
		instanceId: number;
		property: string;
		mediaId: number;
	},
) {
	const result = await new EdgeCMSClient(config).setBlockMedia(input);
	console.log(
		`Attached media ${result.mediaId} to ${result.collection}#${result.instanceId}.${result.property} (${result.state} v${result.draftVersionId}).`,
	);
}
