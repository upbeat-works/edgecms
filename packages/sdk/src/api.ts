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
