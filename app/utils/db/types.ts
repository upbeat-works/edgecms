// Shared database types

export type JsonPrimitive = string | number | boolean | null;

/**
 * A JSON-serializable value.
 *
 * Prefer this over `unknown` for data that crosses a serialization boundary
 * (R2 snapshots, Workflow steps, API payloads). workerd's `Serializable<T>`
 * cannot prove `unknown` is structured-cloneable, so `Record<string, unknown>`
 * is rejected when passed through a Workflow step.
 *
 * Deliberately bounded rather than fully recursive: `Serializable<T>` is itself
 * recursive, and composing the two trips TS2589 ("type instantiation is
 * excessively deep"). Widen this only if the data genuinely nests deeper.
 */
export type JsonValue =
	| JsonPrimitive
	| JsonPrimitive[]
	| { [key: string]: JsonPrimitive | JsonPrimitive[] };

export interface Language {
	locale: string;
	default: boolean;
}

export interface Section {
	name: string;
}

export interface SectionWithCounts {
	name: string;
	mediaCount: number;
	translationCount: number;
	translationKeysCount: number;
}

export interface Translation {
	key: string;
	language: string;
	value: string;
	section: string | null;
	/** Hash of the default-locale value this translation was written against. */
	sourceHash: string | null;
	/**
	 * The default-locale value has changed since this translation was last
	 * written, so it may no longer say the same thing.
	 */
	stale: boolean;
}

/** A key holding a default-locale value that a target locale does not answer. */
export interface UntranslatedKey {
	key: string;
	section: string | null;
	value: string;
}

/** How much of a locale's backlog a translation run takes on. */
export type TranslationScope = 'missing' | 'missing-and-stale';

/** A translation left behind by a change to the default-locale value. */
export interface StaleTranslation {
	key: string;
	section: string | null;
	/** The default-locale value as it now stands. */
	defaultValue: string;
	/** The translation, written against an earlier default value. */
	value: string;
}

export interface Media {
	id: number;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	section: string | null;
	state: 'live' | 'archived';
	uploadedAt: Date;
	version: number;
}

export interface Version {
	id: number;
	description: string | null;
	status: 'draft' | 'live' | 'archived';
	createdAt: Date;
	createdBy: string | null;
}

export type LegalDocumentType =
	'terms_and_conditions' | 'privacy_policy' | 'cookie_policy' | 'dpa' | 'other';

export type LegalReleaseStatus =
	'processing' | 'failed' | 'published' | 'active' | 'retired';

export interface LegalDocument {
	id: number;
	name: string;
	slug: string;
	type: LegalDocumentType;
	createdAt: Date;
	updatedAt: Date;
	createdBy: string | null;
}

export interface LegalDocumentDraft {
	documentId: number;
	locale: string;
	markdown: string;
	updatedAt: Date;
	updatedBy: string | null;
}

export interface LegalRelease {
	id: number;
	documentId: number;
	version: string;
	effectiveDate: string;
	status: LegalReleaseStatus;
	workflowId: string | null;
	failureReason: string | null;
	createdAt: Date;
	publishedAt: Date | null;
	activatedAt: Date | null;
	retiredAt: Date | null;
	createdBy: string | null;
}

export interface LegalReleaseVariant {
	id: number;
	releaseId: number;
	locale: string;
	payload: string;
	releaseHash: string | null;
	signature: string | null;
	signingKeyId: string | null;
	publicJwk: string | null;
	pdfKey: string | null;
}
