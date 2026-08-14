import {
	assignContentToSection as assignContentToSectionRows,
	createSection as createSectionRow,
	deleteSection as deleteSectionRow,
	getSections,
	updateSection as updateSectionRow,
} from '../db/sections.server';
import { getExistingMediaIds } from '../db/media.server';
import { getExistingTranslationKeys } from '../db/translations.server';
import { err, ok, type ServiceResult } from './result';

export interface SectionResult {
	name: string;
}

export interface DeleteSectionResult extends SectionResult {
	dryRun: boolean;
	deleted: boolean;
}

export interface SectionAssignmentResult {
	section: string;
	translationKeysAssigned: number;
	mediaAssigned: number;
}

function normalizeName(name: string): string | null {
	const normalized = name.trim();
	return normalized === '' ? null : normalized;
}

function invalidName(name: string) {
	return err(
		'INVALID_SECTION_NAME',
		`Section name ${JSON.stringify(name)} must contain a non-whitespace character`,
		400,
	);
}

export async function listSections(): Promise<
	ServiceResult<{ sections: SectionResult[] }>
> {
	return ok({ sections: await getSections() });
}

export async function createSection(
	name: string,
): Promise<ServiceResult<SectionResult>> {
	const normalized = normalizeName(name);
	if (normalized == null) return invalidName(name);

	const existing = await getSections();
	if (existing.some(section => section.name === normalized)) {
		return err('SECTION_EXISTS', `Section "${normalized}" already exists`, 409);
	}

	await createSectionRow(normalized);
	return ok({ name: normalized });
}

export async function renameSection(
	name: string,
	newName: string,
): Promise<ServiceResult<SectionResult>> {
	const normalizedName = normalizeName(name);
	if (normalizedName == null) return invalidName(name);

	const normalizedNewName = normalizeName(newName);
	if (normalizedNewName == null) return invalidName(newName);

	const existing = await getSections();
	if (!existing.some(section => section.name === normalizedName)) {
		return err(
			'SECTION_NOT_FOUND',
			`Section "${normalizedName}" does not exist`,
			404,
		);
	}
	if (
		normalizedNewName !== normalizedName &&
		existing.some(section => section.name === normalizedNewName)
	) {
		return err(
			'SECTION_EXISTS',
			`Section "${normalizedNewName}" already exists`,
			409,
		);
	}

	if (normalizedNewName !== normalizedName) {
		await updateSectionRow(normalizedName, normalizedNewName);
	}
	return ok({ name: normalizedNewName });
}

export async function assignContentToSection(
	name: string,
	assignments: { translationKeys?: string[]; mediaIds?: number[] },
): Promise<ServiceResult<SectionAssignmentResult>> {
	const normalized = normalizeName(name);
	if (normalized == null) return invalidName(name);

	const existingSections = await getSections();
	if (!existingSections.some(section => section.name === normalized)) {
		return err(
			'SECTION_NOT_FOUND',
			`Section "${normalized}" does not exist. Create it with: edgecms sections:add "${normalized}"`,
			404,
		);
	}

	const translationKeys = [...new Set(assignments.translationKeys ?? [])];
	const mediaIds = [...new Set(assignments.mediaIds ?? [])];
	if (translationKeys.length === 0 && mediaIds.length === 0) {
		return err(
			'EMPTY_SECTION_ASSIGNMENT',
			'Provide at least one i18n key or media ID to assign',
			400,
		);
	}

	const [existingTranslationKeys, existingMediaIds] = await Promise.all([
		getExistingTranslationKeys(translationKeys),
		getExistingMediaIds(mediaIds),
	]);
	const existingTranslationKeySet = new Set(existingTranslationKeys);
	const existingMediaIdSet = new Set(existingMediaIds);
	const missingTranslationKeys = translationKeys.filter(
		key => !existingTranslationKeySet.has(key),
	);
	const missingMediaIds = mediaIds.filter(id => !existingMediaIdSet.has(id));

	if (missingTranslationKeys.length > 0 || missingMediaIds.length > 0) {
		const missing: string[] = [];
		if (missingTranslationKeys.length > 0) {
			missing.push(`i18n keys: ${missingTranslationKeys.join(', ')}`);
		}
		if (missingMediaIds.length > 0) {
			missing.push(`media IDs: ${missingMediaIds.join(', ')}`);
		}
		return err(
			'SECTION_CONTENT_NOT_FOUND',
			`Cannot assign missing ${missing.join('; ')}`,
			404,
		);
	}

	await assignContentToSectionRows(normalized, { translationKeys, mediaIds });

	return ok({
		section: normalized,
		translationKeysAssigned: translationKeys.length,
		mediaAssigned: mediaIds.length,
	});
}

export async function deleteSection(
	name: string,
	options: { dryRun?: boolean } = {},
): Promise<ServiceResult<DeleteSectionResult>> {
	const normalized = normalizeName(name);
	if (normalized == null) return invalidName(name);

	const existing = await getSections();
	if (!existing.some(section => section.name === normalized)) {
		return err(
			'SECTION_NOT_FOUND',
			`Section "${normalized}" does not exist`,
			404,
		);
	}

	const dryRun = options.dryRun !== false;
	if (!dryRun) await deleteSectionRow(normalized);

	return ok({ name: normalized, dryRun, deleted: !dryRun });
}
