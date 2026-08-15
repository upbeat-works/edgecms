import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EdgeCMSClient, type LegalDocumentType } from '../api.js';
import type { EdgeCMSConfig } from '../config.js';

export const LEGAL_DOCUMENT_TYPES: LegalDocumentType[] = [
	'terms_and_conditions',
	'privacy_policy',
	'cookie_policy',
	'dpa',
	'other',
];

export interface CreateLegalDraftOptions {
	name: string;
	type: LegalDocumentType;
	slug?: string;
	locale?: string;
}

export interface UpdateLegalDraftOptions {
	locale?: string;
}

export function parseLegalDocumentType(value: string): LegalDocumentType {
	if (LEGAL_DOCUMENT_TYPES.includes(value as LegalDocumentType)) {
		return value as LegalDocumentType;
	}
	throw new Error(
		`Legal document type must be one of: ${LEGAL_DOCUMENT_TYPES.join(', ')}`,
	);
}

async function readMarkdown(file: string): Promise<string> {
	const path = resolve(process.cwd(), file);
	try {
		await access(path);
	} catch {
		throw new Error(`File not found: ${path}`);
	}
	return readFile(path, 'utf8');
}

export async function createLegalDraft(
	config: EdgeCMSConfig,
	file: string,
	options: CreateLegalDraftOptions,
): Promise<void> {
	const locale = options.locale ?? config.defaultLocale;
	const result = await new EdgeCMSClient(config).createLegalDraft({
		name: options.name,
		slug: options.slug,
		type: options.type,
		locale,
		markdown: await readMarkdown(file),
	});
	console.log(
		`Created legal document ${result.id} "${result.name}" (${result.slug}); ${result.locale} draft saved. Publish it from the EdgeCMS legal UI.`,
	);
}

export async function updateLegalDraft(
	config: EdgeCMSConfig,
	documentId: number,
	file: string,
	options: UpdateLegalDraftOptions = {},
): Promise<void> {
	if (!Number.isInteger(documentId) || documentId < 1) {
		throw new Error('Invalid legal document ID');
	}
	const locale = options.locale ?? config.defaultLocale;
	const result = await new EdgeCMSClient(config).updateLegalDraft(
		documentId,
		locale,
		await readMarkdown(file),
	);
	console.log(
		`Updated legal document ${result.documentId}; ${result.locale} draft saved. Publish it from the EdgeCMS legal UI.`,
	);
}
