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
