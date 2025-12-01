// Shared database types

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
