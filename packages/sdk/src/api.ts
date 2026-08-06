export interface EdgeCMSClientConfig {
	baseUrl: string;
	apiKey: string;
}

export interface Language {
	locale: string;
	default: boolean;
}

export interface PullResponse {
	languages: Language[];
	defaultLocale: string | null;
	translations: Record<string, Record<string, string>>;
}

export interface PushResponse {
	success: boolean;
	keysUpdated: number;
	locale: string;
	section: string | null;
}

export interface LanguagesResponse {
	languages: Language[];
	defaultLocale: string | null;
}

export interface ApiError {
	error: string;
	code: string;
}

export interface BlockItem {
	id: number;
	position: number;
	[key: string]: unknown;
}

export interface BlocksResponse {
	collection: string;
	schema: string;
	section: string | null;
	items: BlockItem[];
}

export interface ImportBlocksResponse {
	success: boolean;
	instancesCreated: number;
}

export interface PublishResponse {
	publishId: string;
	versionId: number;
}

/** queued | running | paused | errored | terminated | complete */
export interface PublishStatusResponse {
	publishId: string;
	status: string;
	error: string | null;
}

export interface MissingKey {
	key: string;
	section: string | null;
	defaultValue: string;
}

export interface DeleteKeysResponse {
	dryRun: boolean;
	requested: number;
	/** Deleted, or — under a dry run — what deleting would remove. */
	deleted: string[];
	/** Keys a block instance depends on. Never deleted. */
	protected: string[];
	/** Keys the CMS does not hold. */
	missing: string[];
}

export type BlockPropertyType =
	| 'string'
	| 'number'
	| 'translation'
	| 'media'
	| 'boolean'
	| 'block'
	| 'collection';

export interface BlockProperty {
	name: string;
	type: BlockPropertyType;
	refSchema?: string;
	description?: string;
}

export interface BlockSchemaResponse {
	name: string;
	created: boolean;
	propertiesAdded: number;
	/** Existing properties whose declared description was applied. */
	propertiesUpdated: number;
	properties: Required<BlockProperty>[];
}

export interface BlockSchemasResponse {
	schemas: { name: string; properties: Required<BlockProperty>[] }[];
}

export interface BlockCollectionResponse {
	name: string;
	schema: string;
	section: string | null;
	singleton: boolean;
	created: boolean;
	/** An existing collection was moved to the declared section. */
	updated: boolean;
	instanceCount: number;
}

export interface BlockCollectionsResponse {
	collections: Omit<BlockCollectionResponse, 'created' | 'updated'>[];
}

export interface MissingTranslationsResponse {
	defaultLocale: string;
	totalMissing: number;
	locales: Record<string, { missingCount: number; keys: MissingKey[] }>;
}

class EdgeCMSApiError extends Error {
	constructor(
		public code: string,
		message: string,
		public status: number,
	) {
		super(message);
		this.name = 'EdgeCMSApiError';
	}
}

/**
 * API client for EdgeCMS i18n endpoints.
 */
export class EdgeCMSClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(config: EdgeCMSClientConfig) {
		this.baseUrl = config.baseUrl;
		this.apiKey = config.apiKey;
	}

	private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			'x-api-key': this.apiKey,
			...(options.headers as Record<string, string>),
		};

		if (options.body && typeof options.body === 'string') {
			headers['Content-Type'] = 'application/json';
		}

		const response = await fetch(url, {
			...options,
			headers,
		});

		if (!response.ok) {
			let errorData: ApiError;
			try {
				errorData = (await response.json()) as ApiError;
			} catch {
				errorData = {
					error: `HTTP ${response.status}: ${response.statusText}`,
					code: 'HTTP_ERROR',
				};
			}
			throw new EdgeCMSApiError(
				errorData.code,
				errorData.error,
				response.status,
			);
		}

		return response.json() as Promise<T>;
	}

	/**
	 * Pull all translations from the CMS.
	 */
	async pull(version: 'draft' | 'live' = 'live'): Promise<PullResponse> {
		return this.fetch<PullResponse>(`/api/i18n/pull?version=${version}`);
	}

	/**
	 * Push translations to the CMS.
	 */
	async push(
		locale: string,
		translations: Record<string, string>,
		section?: string,
	): Promise<PushResponse> {
		return this.fetch<PushResponse>('/api/i18n/push', {
			method: 'POST',
			body: JSON.stringify({ locale, translations, section }),
		});
	}

	/**
	 * Delete translation keys and every locale's value for them.
	 *
	 * A dry run unless `dryRun: false` is passed: the CMS reports what would go
	 * rather than deleting it. Keys owned by block instances are never deleted
	 * and come back under `protected`.
	 */
	async deleteKeys(
		keys: string[],
		options: { dryRun?: boolean } = {},
	): Promise<DeleteKeysResponse> {
		return this.fetch<DeleteKeysResponse>('/api/i18n/keys', {
			method: 'DELETE',
			body: JSON.stringify({ keys, dryRun: options.dryRun !== false }),
		});
	}

	/**
	 * List block schemas and their properties.
	 */
	async getBlockSchemas(): Promise<BlockSchemasResponse> {
		return this.fetch<BlockSchemasResponse>('/api/blocks/schemas');
	}

	/**
	 * Create a schema, or add the properties it is missing. Additive — an
	 * existing property is never retyped or dropped.
	 */
	async applyBlockSchema(
		name: string,
		properties: BlockProperty[] = [],
	): Promise<BlockSchemaResponse> {
		return this.fetch<BlockSchemaResponse>('/api/blocks/schemas', {
			method: 'POST',
			body: JSON.stringify({ name, properties }),
		});
	}

	/**
	 * List block collections.
	 */
	async getBlockCollections(): Promise<BlockCollectionsResponse> {
		return this.fetch<BlockCollectionsResponse>('/api/blocks/collections');
	}

	/**
	 * Create a collection bound to a schema. Re-creating an identical one is a
	 * no-op, so a declarative document can be applied repeatedly.
	 */
	async createBlockCollection(input: {
		name: string;
		schema: string;
		section?: string;
		singleton?: boolean;
	}): Promise<BlockCollectionResponse> {
		return this.fetch<BlockCollectionResponse>('/api/blocks/collections', {
			method: 'POST',
			body: JSON.stringify(input),
		});
	}

	/**
	 * Get available languages.
	 */
	async getLanguages(): Promise<LanguagesResponse> {
		return this.fetch<LanguagesResponse>('/api/i18n/languages');
	}

	/**
	 * Create a language. The first language created is always the default.
	 */
	async createLanguage(
		locale: string,
		options: { makeDefault?: boolean } = {},
	): Promise<Language> {
		return this.fetch<Language>('/api/i18n/languages', {
			method: 'POST',
			body: JSON.stringify({ locale, default: options.makeDefault }),
		});
	}

	/**
	 * Mark an existing language as the default.
	 */
	async setDefaultLanguage(locale: string): Promise<Language> {
		return this.fetch<Language>('/api/i18n/languages', {
			method: 'PATCH',
			body: JSON.stringify({ locale }),
		});
	}

	/**
	 * Release the current draft, making it live. Asynchronous — poll the
	 * returned id with `getPublishStatus`.
	 */
	async publish(): Promise<PublishResponse> {
		return this.fetch<PublishResponse>('/api/publish', { method: 'POST' });
	}

	async getPublishStatus(publishId: string): Promise<PublishStatusResponse> {
		return this.fetch<PublishStatusResponse>(
			`/api/publish?id=${encodeURIComponent(publishId)}`,
		);
	}

	/**
	 * Report keys present in the default locale but missing or empty elsewhere.
	 */
	async getMissingTranslations(
		locale?: string,
	): Promise<MissingTranslationsResponse> {
		const query = locale ? `?locale=${encodeURIComponent(locale)}` : '';
		return this.fetch<MissingTranslationsResponse>(`/api/i18n/missing${query}`);
	}

	/**
	 * Get block collection data by name.
	 */
	async getBlocks(collectionName: string): Promise<BlocksResponse> {
		return this.fetch<BlocksResponse>(
			`/public/blocks/${encodeURIComponent(collectionName)}`,
		);
	}

	/**
	 * Bulk-import block instances into a collection.
	 */
	async importBlocks(
		collection: string,
		items: Record<string, unknown>[],
		locale: string,
	): Promise<ImportBlocksResponse> {
		return this.fetch<ImportBlocksResponse>('/api/blocks/import', {
			method: 'POST',
			body: JSON.stringify({ collection, items, locale }),
		});
	}
}
