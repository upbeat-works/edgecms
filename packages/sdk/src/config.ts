import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface EdgeCMSConfig {
	/** Base URL of the EdgeCMS instance (e.g., "https://cms.example.com/edge-cms") */
	baseUrl: string;
	/** API key for authentication (can use ${ENV_VAR} syntax) */
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
						baseUrl: 'https://your-cms.example.com/edge-cms',
						apiKey: '${EDGECMS_API_KEY}',
						localesDir: './src/locales',
						defaultLocale: 'en',
						typesOutputPath: './src/locales/types.ts',
					},
					null,
					2,
				),
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

	// Validate required fields
	const requiredFields: (keyof EdgeCMSConfig)[] = [
		'baseUrl',
		'apiKey',
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

	// Resolve environment variables in apiKey
	const apiKey = resolveEnvVars(rawConfig.apiKey!);

	// Normalize baseUrl (remove trailing slash)
	const baseUrl = rawConfig.baseUrl!.replace(/\/$/, '');

	return {
		baseUrl,
		apiKey,
		localesDir: rawConfig.localesDir!,
		defaultLocale: rawConfig.defaultLocale!,
		typesOutputPath: rawConfig.typesOutputPath!,
	};
}
