import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface EdgeCMSConfig {
	/** Base URL of the EdgeCMS instance. Can be set via EDGECMS_BASE_URL env var or in config file (supports ${ENV_VAR} syntax). */
	baseUrl: string;
	/** API key for authentication. Must be set via EDGECMS_API_KEY env var. */
	apiKey: string;
	/** Directory where locale JSON files are stored */
	localesDir: string;
	/** Default locale (e.g., "en") */
	defaultLocale: string;
	/** Path to output TypeScript types file */
	typesOutputPath: string;
}

const CONFIG_FILENAME = 'edgecms.config.json';

/**
 * Resolves environment variable references in a string.
 * Supports ${VAR_NAME} syntax.
 */
function resolveEnvVars(value: string): string {
	return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
		const envValue = process.env[envVar];
		if (!envValue) {
			throw new Error(
				`Environment variable "${envVar}" is not set. ` +
					`Please set it in your environment or .env file.`,
			);
		}
		return envValue;
	});
}

/**
 * Loads the EdgeCMS configuration from the project root.
 * Looks for edgecms.config.json in the current working directory.
 */
export function loadConfig(cwd: string = process.cwd()): EdgeCMSConfig {
	const configPath = resolve(cwd, CONFIG_FILENAME);

	if (!existsSync(configPath)) {
		throw new Error(
			`Configuration file not found: ${CONFIG_FILENAME}\n` +
				`Please create a ${CONFIG_FILENAME} file in your project root.\n\n` +
				`Example:\n` +
				JSON.stringify(
					{
						localesDir: './src/locales',
						defaultLocale: 'en',
						typesOutputPath: './src/locales/types.ts',
					},
					null,
					2,
				) +
				`\n\nAlso set these environment variables:\n` +
				`  EDGECMS_API_KEY=your-api-key\n` +
				`  EDGECMS_BASE_URL=https://your-cms.example.com/edge-cms`,
		);
	}

	let rawConfig: Partial<EdgeCMSConfig>;
	try {
		const content = readFileSync(configPath, 'utf-8');
		rawConfig = JSON.parse(content);
	} catch (error) {
		throw new Error(
			`Failed to parse ${CONFIG_FILENAME}: ${(error as Error).message}`,
		);
	}

	// Validate required fields (baseUrl and apiKey are resolved from env)
	const requiredFields: (keyof EdgeCMSConfig)[] = [
		'localesDir',
		'defaultLocale',
		'typesOutputPath',
	];

	for (const field of requiredFields) {
		if (!rawConfig[field]) {
			throw new Error(
				`Missing required field "${field}" in ${CONFIG_FILENAME}`,
			);
		}
	}

	// API key must come from env
	const apiKey = process.env.EDGECMS_API_KEY;
	if (!apiKey) {
		throw new Error(
			`Environment variable "EDGECMS_API_KEY" is not set. ` +
				`Please set it in your environment or .env file.`,
		);
	}

	// Base URL: env takes priority, then config file (which supports ${ENV_VAR} syntax)
	const rawBaseUrl = process.env.EDGECMS_BASE_URL ?? rawConfig.baseUrl;
	if (!rawBaseUrl) {
		throw new Error(
			`Base URL is not configured. Set the EDGECMS_BASE_URL environment variable ` +
				`or add "baseUrl" to ${CONFIG_FILENAME}.`,
		);
	}
	const baseUrl = resolveEnvVars(rawBaseUrl).replace(/\/$/, '');

	return {
		baseUrl,
		apiKey,
		localesDir: rawConfig.localesDir!,
		defaultLocale: rawConfig.defaultLocale!,
		typesOutputPath: rawConfig.typesOutputPath!,
	};
}
