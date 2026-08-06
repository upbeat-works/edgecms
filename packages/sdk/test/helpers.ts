import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { EdgeCMSConfig } from '../src/config.js';

/**
 * A CMS standing in for the real one at the HTTP boundary — the only thing
 * these tests mock. It enforces the rules the CLI has to plan around: a
 * reference can only name a schema that already exists, and applying the same
 * document twice must not create anything twice.
 */
export function fakeCMS() {
	const schemas = new Map<
		string,
		{ name: string; properties: Record<string, unknown>[] }
	>();
	const collections = new Map<string, Record<string, unknown>>();
	const translations: Record<string, Record<string, string>> = {};
	const deleteRequests: { keys: string[]; dryRun: boolean }[] = [];

	function applySchema(body: {
		name: string;
		properties?: { name: string; type: string; refSchema?: string }[];
	}) {
		const declared = body.properties ?? [];

		for (const property of declared) {
			if (
				(property.type === 'block' || property.type === 'collection') &&
				property.refSchema !== body.name &&
				!schemas.has(property.refSchema ?? '')
			) {
				return {
					status: 400,
					body: {
						error: `Property "${property.name}" references schema "${property.refSchema}", which does not exist`,
						code: 'REF_SCHEMA_NOT_FOUND',
					},
				};
			}
		}

		const existing = schemas.get(body.name);
		const schema = existing ?? { name: body.name, properties: [] };
		const before = schema.properties.length;

		for (const property of declared) {
			if (schema.properties.some(p => p.name === property.name)) continue;
			schema.properties.push({
				refSchema: null,
				description: null,
				...property,
			});
		}
		schemas.set(body.name, schema);

		return {
			status: existing ? 200 : 201,
			body: {
				name: body.name,
				created: !existing,
				propertiesAdded: schema.properties.length - before,
				properties: schema.properties,
			},
		};
	}

	function createCollection(body: {
		name: string;
		schema: string;
		section?: string;
		singleton?: boolean;
	}) {
		if (!schemas.has(body.schema)) {
			return {
				status: 404,
				body: {
					error: `Schema "${body.schema}" does not exist`,
					code: 'SCHEMA_NOT_FOUND',
				},
			};
		}

		const existing = collections.get(body.name);
		const collection = existing ?? {
			name: body.name,
			schema: body.schema,
			section: body.section ?? body.name,
			singleton: body.singleton === true,
			instanceCount: body.singleton ? 1 : 0,
		};
		collections.set(body.name, collection);

		return {
			status: existing ? 200 : 201,
			body: { ...collection, created: !existing },
		};
	}

	const server = setupServer(
		http.post('*/api/blocks/schemas', async ({ request }) => {
			const result = applySchema(await request.json());
			return HttpResponse.json(result.body, { status: result.status });
		}),
		http.post('*/api/blocks/collections', async ({ request }) => {
			const result = createCollection(await request.json());
			return HttpResponse.json(result.body, { status: result.status });
		}),
		http.get('*/api/i18n/pull', () =>
			HttpResponse.json({
				languages: Object.keys(translations).map((locale, index) => ({
					locale,
					default: index === 0,
				})),
				defaultLocale: Object.keys(translations)[0] ?? null,
				translations,
			}),
		),
		http.delete('*/api/i18n/keys', async ({ request }) => {
			const body = (await request.json()) as {
				keys: string[];
				dryRun: boolean;
			};
			deleteRequests.push({ keys: body.keys, dryRun: body.dryRun });
			const held = translations[Object.keys(translations)[0]] ?? {};
			const present = body.keys.filter(key => key in held);
			if (body.dryRun === false) {
				for (const key of present) {
					for (const locale of Object.keys(translations))
						delete translations[locale][key];
				}
			}

			return HttpResponse.json({
				dryRun: body.dryRun,
				requested: body.keys.length,
				deleted: present,
				protected: [],
				missing: body.keys.filter(key => !(key in held)),
			});
		}),
	);

	return {
		schemas,
		collections,
		translations,
		deleteRequests,
		propertyNames(schemaName: string) {
			return (schemas.get(schemaName)?.properties ?? []).map(p => p.name);
		},
		install() {
			server.listen({ onUnhandledRequest: 'error' });
		},
		close() {
			server.close();
		},
	};
}

/** A project directory with a config pointing at it. */
export async function projectDir(files: Record<string, unknown> = {}) {
	const dir = await mkdtemp(join(tmpdir(), 'edgecms-sdk-'));
	await mkdir(join(dir, 'locales'), { recursive: true });

	for (const [name, contents] of Object.entries(files)) {
		await writeFile(
			join(dir, name),
			typeof contents === 'string' ? contents : JSON.stringify(contents),
		);
	}

	// Absolute, so the commands' `resolve(process.cwd(), ...)` lands in the
	// temp project rather than wherever the test runner happens to be.
	const config: EdgeCMSConfig = {
		baseUrl: 'https://cms.test/edge-cms',
		apiKey: 'test-key',
		localesDir: join(dir, 'locales'),
		defaultLocale: 'en',
		typesOutputPath: join(dir, 'locales/types.ts'),
	};

	return { dir, config, path: (name: string) => join(dir, name) };
}
