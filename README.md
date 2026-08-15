# EdgeCMS

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/upbeat-works/edgecms)

Your content, on the edge. EdgeCMS is a headless content management system that
runs entirely on Cloudflare Workers — no origin servers, no cold starts, no
nonsense. Ship i18n, media, and structured content blocks from the fastest
infrastructure on the planet.

## Why EdgeCMS?

- **Zero-origin architecture** — D1 for storage, KV for caching, R2 for media.
  Everything runs at the edge.
- **Drop-in ready** — Deploy alongside your existing Cloudflare Workers app. All
  routes live under `/edge-cms`.
- **Type-safe SDK** — Pull translations, generate TypeScript types, and import
  content blocks from the CLI. Your IDE stays happy.
- **Version control for content** — Draft, publish, rollback. Treat your content
  like code.
- **Signed legal releases** — Localized Markdown, immutable evidence, PDF
  renditions, and automatic publication history.
- **AI-powered translations** — Auto-translate missing keys with OpenAI. Ship
  faster in every language.

## Features

### Internationalization (i18n)

- Multi-language support with fallback to default locale
- Inline editing with auto-save — no submit buttons, no friction
- Section-based organization for large translation sets
- Stale detection — change a default-locale value and every translation written
  against the old one is flagged for review
- Draft/live versioning with publish and rollback
- AI-powered auto-translation, for untranslated keys alone or for outdated ones
  as well — your call at the point of running it
- Cached public API endpoints for blazing-fast delivery

### Content Blocks

- Define block schemas with typed properties (string, number, boolean,
  translation, media, block, collection)
- Create singleton or multi-instance collections
- Nest blocks within blocks for complex content structures
- Full versioning support — draft, publish, rollback
- Bulk import via CLI for migration workflows

### Media Management

- Upload files to R2 with automatic kebab-case sanitization
- Section-based organization
- Direct streaming from R2 — no intermediary processing
- Media state tracking with draft/live versioning

### Authentication & API Keys

- Email/password auth powered by Better Auth
- Admin role management with protected routes
- API key support for programmatic access
- Per-key rate limiting (default: 1000 req/hour)
- Usage tracking with last-request timestamps

### Legal Documents

- Localized Markdown drafts managed at `/edge-cms/legal`
- Draft creation and updates from Markdown through the SDK and CLI
- Deterministic SHA-256 `releaseHash` over the exact frozen release payload
- ES256 signatures and verification keys retained with release history
- Sanitized PDF renditions generated with Cloudflare Browser Run and Puppeteer
- One-step publishing that replaces the current legal document and retains its
  history
- Public evidence, PDF, and key endpoints for consent integrations

See [Legal documents and signed releases](docs/legal-documents.md) for the
canonical payload, key setup, lifecycle, and consent-integration boundary.

### Version Control

- Draft and live content states
- Publish drafts with Cloudflare Workflows
- Rollback to any previous version instantly
- Version descriptions for change tracking

## Stack

| Layer     | Technology                 |
| --------- | -------------------------- |
| Framework | React Router v7            |
| UI        | Tailwind CSS 4 + shadcn/ui |
| Database  | Cloudflare D1 (SQLite)     |
| ORM       | Drizzle                    |
| Cache     | Cloudflare KV              |
| Storage   | Cloudflare R2              |
| Auth      | Better Auth                |
| AI        | OpenAI (via AI SDK)        |
| Workflows | Cloudflare Workflows       |
| Legal PDF | Cloudflare Browser Run     |
| Runtime   | Cloudflare Workers         |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file for local development:

```env
AUTH_SECRET=your-secret-key-here
ADMIN_SIGNUP_PASSWORD=your-admin-signup-secret
OPENAI_API_KEY=your-openai-api-key  # Optional — for AI translations
LEGAL_SIGNING_PRIVATE_JWK={"kty":"EC","x":"...","y":"...","crv":"P-256","d":"...","alg":"ES256","key_ops":["sign"],"ext":true}
```

`LEGAL_SIGNING_PRIVATE_JWK` is required for the EdgeCMS app to build and run.
Generate it with `npm run legal:keygen`. Keep it secret; the public half is
derived and retained with every signed release.

For production, set these as Cloudflare secrets:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_SIGNUP_PASSWORD
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put LEGAL_SIGNING_PRIVATE_JWK
```

### 3. Configure Cloudflare Bindings

Your `wrangler.jsonc` needs the following bindings:

```jsonc
{
	// D1 Database
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "edgecms-db",
			"database_id": "<your-database-id>",
			"migrations_dir": "./migrations",
		},
	],

	// KV Cache
	"kv_namespaces": [
		{
			"binding": "CACHE",
			"id": "<your-kv-namespace-id>",
		},
	],

	// R2 Storage
	"r2_buckets": [
		{ "binding": "MEDIA_BUCKET", "bucket_name": "edgecms-media" },
		{ "binding": "BACKUPS_BUCKET", "bucket_name": "edgecms-backups" },
	],

	// Workflows
	"workflows": [
		{
			"name": "edgecms-release-version-workflow",
			"binding": "RELEASE_VERSION_WORKFLOW",
			"class_name": "ReleaseVersionWorkflow",
		},
		{
			"name": "edgecms-rollback-version-workflow",
			"binding": "ROLLBACK_VERSION_WORKFLOW",
			"class_name": "RollbackVersionWorkflow",
		},
		{
			"name": "edgecms-ai-translate-workflow",
			"binding": "AI_TRANSLATE_WORKFLOW",
			"class_name": "AITranslateWorkflow",
		},
		{
			"name": "edgecms-legal-release-workflow",
			"binding": "LEGAL_RELEASE_WORKFLOW",
			"class_name": "LegalReleaseWorkflow",
		},
	],

	// Browser Run
	"browser": { "binding": "BROWSER" },

	// Environment
	"vars": {
		"BASE_URL": "https://your-domain.com",
		"TRUSTED_ORIGINS": "https://your-domain.com",
		"LEGAL_SIGNING_KEY_ID": "edgecms-legal-1",
	},
}
```

### 4. Run Migrations

```bash
# Local
npx wrangler d1 migrations apply edgecms-db --local

# Production
npx wrangler d1 migrations apply edgecms-db
```

### 5. Generate Types

```bash
npm run typecheck
```

## Development

```bash
npm run dev
```

Legal PDF publication uses `@cloudflare/puppeteer` with the Browser Run binding
configured in `wrangler.jsonc`. Standard local Wrangler development launches a
local headless browser.

## Testing

```bash
npm test           # CMS + SDK
npm run test:watch # Watch mode (CMS)
npm run test:sdk   # CLI/SDK only
```

Tests run inside the Workers runtime via `@cloudflare/vitest-pool-workers`,
against a real D1 database with the project's migrations applied, real R2 and KV
bindings, and real Workflows. API-key tests issue genuine better-auth keys, and
ordinary content publish tests run `ReleaseVersionWorkflow` through to
completion before asserting on its D1 rows and R2 objects. Legal tests exercise
the real signing, persistence, lifecycle, and HTTP routes while faking the two
external execution boundaries: Browser Run and starting a Workflow instance.

The CLI in `packages/sdk` is plain Node code, so it is tested separately in a
Node environment (`npm run test:sdk`). Those tests stub `fetch` — the one
boundary they cannot cross — and drive the real commands against an in-memory
CMS that enforces the rules the CLI has to plan around.

Note: each real release logs an unhandled
`TypeError: The RPC receiver does not implement the method "entries"` from
miniflare's Workflows engine. It has no frame in project code, fires once per
run regardless of step count, and does not affect the outcome — the assertions
confirm every step's effect landed.

## Deployment

```bash
npm run deploy
```

## SDK / CLI

The `@upbeat-works/edgecms-sdk` package gives you a CLI and programmatic API to
interact with EdgeCMS from your codebase.

### Installation

```bash
npm install @upbeat-works/edgecms-sdk
```

### Configuration

Create an `edgecms.config.json` in your project root:

```json
{
	"localesDir": "./src/locales",
	"defaultLocale": "en",
	"typesOutputPath": "./src/locales/types.ts",
	"baseUrl": "${EDGECMS_BASE_URL}"
}
```

Set your API key as an environment variable:

```bash
export EDGECMS_API_KEY=your-api-key
export EDGECMS_BASE_URL=https://your-domain.com/edge-cms
```

### Commands

#### Legal drafts

Create a legal document and its first localized draft from Markdown, then
replace any configured locale's draft by document ID:

```bash
edgecms legal:create ./privacy.en.md \
  --name "Privacy Policy" \
  --type privacy_policy \
  --locale en
edgecms legal:create ./terms.md \
  --name "Terms" \
  --type terms_and_conditions \
  --slug customer-terms
edgecms legal:update 42 ./privacy.es.md --locale es
```

`--locale` defaults to `defaultLocale`, and the locale must already exist in
EdgeCMS. The files are saved exactly as mutable drafts. These commands never
sign or publish a legal document. Review and publish legal drafts from
`/edge-cms/legal`; the general `edgecms publish` command only releases the
shared content draft.

#### Media and block media

Media uploads are live immediately. Each replacement creates a new revision ID
while preserving the filename and canonical URL, so existing block references
continue to resolve.

```bash
edgecms media --search hero                 # List/search current media
edgecms media --all-versions                # Include archived revisions
edgecms media:upload ./hero.png --section home
edgecms media:replace 42 ./hero-new.png
edgecms media:rename 42 homepage-hero.png
edgecms blocks:set-media heroes 7 image 43  # Saved in the shared draft
```

The upload, replace, and rename commands print the revision ID, state, and
canonical URL. Renaming moves every stored revision to the new filename while
preserving its revision ID, version, and state. The old public URL stops
resolving. Block attachment and media IDs supplied to `import-blocks` are draft
changes and become live through `edgecms publish`.

#### `edgecms pull`

Pull translations and generate TypeScript types.

```bash
edgecms pull                 # Pull live translations for default locale
edgecms pull --from draft    # Pull draft translations
edgecms pull --all           # Pull all locales
```

This generates a types file with full autocompletion:

```typescript
// Auto-generated by @edgecms/sdk
export interface TranslationKeys {
	'common.title': string;
	'common.description': string;
	'homepage.hero': string;
}

export type TranslationKey = keyof TranslationKeys;

export function t(key: TranslationKey): TranslationKey {
	return key;
}
```

#### `edgecms push`

Push local translations to EdgeCMS as a draft.

```bash
edgecms push                        # Push default locale translations
edgecms push --section "homepage"   # Assign new keys to a section
```

#### `edgecms prune`

`push` only ever adds keys. `prune` is the other half: it compares the CMS
against your local translations file and removes the keys that are no longer
there.

Deleting is destructive, so it never happens by accident:

- **Dry run by default.** Without `--yes` the CMS reports what would go and
  changes nothing. The report is produced by the same code path as the real run,
  so it says exactly what `--yes` will do.
- **Block-owned keys are never deleted.** Keys a block instance generates or
  points at come back under _protected_, whoever asks for them.
- **An empty local file aborts the run.** A broken build that produces no keys
  would otherwise mark the entire CMS as unused.
- **Deletions land in the draft.** Nothing disappears from the live site until
  you `publish`, and a release can be rolled back.

```bash
edgecms prune                  # Report the orphans, delete nothing
edgecms prune --verbose        # List every orphan rather than a sample
edgecms prune --yes            # Delete them from the draft
```

The comparison is against the draft — the state the deletion applies to — and
covers the keys the default locale holds. A key that exists only in a
non-default locale is invisible to the diff, so `prune` will not propose it;
remove those with `keys:delete`. If one CMS serves several apps, run `prune`
from the app that owns the keys, since another app's keys look unused from here.

```
$ edgecms prune
Comparing en.json (312 keys) against the CMS draft (340 keys)

28 keys exist in the CMS but not locally.

24 keys would be deleted:
  home.hero.oldTitle
  checkout.legacy.notice
  ... 22 more (--verbose to list all)

Protected, will not be deleted — 4 keys are owned by block instances:
  blocks.hero.12.title
  ...

Nothing was deleted — this was a dry run. Re-run with --yes to delete these 24 keys.
```

#### `edgecms keys:delete`

Delete named keys, for when you know exactly which ones to remove. Same
protections as `prune`: dry run unless `--yes`, block-owned keys refused, draft
only.

```bash
edgecms keys:delete home.hero.oldTitle checkout.legacy.notice
edgecms keys:delete home.hero.oldTitle --yes
```

#### `edgecms blocks:push`

Declare your block schemas and collections in `blocks.schema.json` and apply
them. Schema names are kebab-case, property names camelCase — the API rejects
anything else rather than silently renaming it.

```json
{
	"schemas": {
		"card": {
			"heading": "translation",
			"url": "string"
		},
		"hero": {
			"title": "translation",
			"image": { "type": "media", "description": "Background image" },
			"cards": { "type": "collection", "refSchema": "card" }
		}
	},
	"collections": {
		"homepage-hero": { "schema": "hero", "singleton": true },
		"features": { "schema": "card", "section": "home" }
	}
}
```

A property is either a type name or an object with `type`, and optionally
`refSchema` (required for `block` and `collection` types) and `description`. New
properties are appended in the order they appear; a `block` or `collection`
property may point at any schema in the file, including its own, whatever order
they are written in.

```bash
edgecms blocks:push                  # Apply ./blocks.schema.json
edgecms blocks:push ./cms/blocks.json  # ...or another file
```

Applying is **additive and idempotent**: it creates schemas, properties and
collections that don't exist yet and leaves everything else alone. It never
deletes a property, retypes one, or rebinds a collection to another schema — it
fails with `PROPERTY_CONFLICT` / `COLLECTION_CONFLICT` instead, so content
already stored under a schema cannot be orphaned by a file edit. Re-running it
after a partial failure is safe.

What the document _does_ keep in sync is the parts that carry no structure: a
property's `description` and a collection's `section` are applied when they
differ. Anything the document doesn't mention is left as the CMS has it, so
descriptions written by an editor survive a push that says nothing about them.

```
$ edgecms blocks:push
Applying /app/blocks.schema.json

  + schema card (2 properties)
  ~ schema hero (+1)
  + collection homepage-hero (singleton)
  = collection features

Note: these are draft changes. Run `edgecms publish` to make them live.
```

Set `"blocksFile"` in `edgecms.config.json` to change the default path.

#### `edgecms schemas` / `edgecms blocks`

List what the CMS holds.

```bash
edgecms schemas    # Schemas with their properties
edgecms blocks     # Collections with their schema and item count
```

#### `edgecms import-blocks`

Bulk import block instances from a JSON file.

```bash
edgecms import-blocks ./data.json "hero-blocks"
edgecms import-blocks ./data.json "carousel" --locale "es"
```

#### `edgecms languages`

Manage locales. A fresh instance has none, and `push` / `import-blocks` reject
unknown locales — so this is the first command to run against a new CMS.

```bash
edgecms languages                      # List locales, marking the default
edgecms languages:add en               # First locale created becomes the default
edgecms languages:add pt-BR            # Added as non-default
edgecms languages:add es --default     # Create and make default in one step
edgecms languages:set-default es       # Promote an existing locale
```

Locale tags are canonicalised to BCP-47 casing (`EN-us` becomes `en-US`), so the
same language can't be created twice under different spellings. The command
prints the tag that was actually created.

#### `edgecms sections`

Manage the sections used to organize translations, media, and block collections.

```bash
edgecms sections                              # List sections
edgecms sections:add Homepage                 # Create a section
edgecms sections:assign-keys Homepage home.title home.subtitle
edgecms sections:assign-media Homepage 12 18  # IDs from `edgecms media`
edgecms sections:rename Homepage Marketing    # Rename it and refile its content
edgecms sections:delete Marketing             # Preview deletion
edgecms sections:delete Marketing --yes       # Delete and leave content unsorted
```

Section deletion is a dry run unless `--yes` is supplied. Deleting a section
does not delete its content; translations, media, and block collections assigned
to it become unsorted. Assignment requires an existing section and existing keys
or media IDs. If any requested resource is missing, nothing is assigned.

#### `edgecms publish`

Release the current draft, making it live. Until you publish, nothing the CLI
writes is visible on the public endpoints.

```bash
edgecms publish                        # Start a release and return immediately
edgecms publish --wait                 # Block until it finishes
edgecms publish --wait --timeout 120   # ...with a custom timeout in seconds
edgecms publish:status <publishId>     # Check a release started earlier
```

`--wait` exits non-zero if the release ends in any state other than `complete`.
Preconditions (an existing draft, a default language) are checked up front, so a
misconfigured CMS fails immediately rather than halfway through a release.

#### `edgecms check`

Report keys present in the default locale but missing or empty elsewhere. Exits
non-zero when anything is missing, which makes it usable as a CI gate.

```bash
edgecms check                  # Every non-default locale
edgecms check --locale es      # Just one
edgecms check --verbose        # List every key rather than a sample
```

#### `edgecms stale`

Report translations written against a default-locale value that has since
changed. The complement of `check`: these keys are translated, they just answer
an older question. Exits non-zero when anything is stale.

```bash
edgecms stale                  # Every non-default locale
edgecms stale --locale es      # Just one
edgecms stale --verbose        # List every key rather than a sample
```

Nothing goes stale on its own — a translation is cleared the moment it is
rewritten, or when an editor confirms it in the admin UI. Changing which locale
is the default resets the tracking, since hashes recorded against the old
default say nothing about the new one.

Push the default locale first when seeding a CMS: a translation pushed before
the value it translates exists has nothing to record, and is reported stale
until it is rewritten or confirmed.

### Programmatic Usage

```typescript
import {
	pull,
	push,
	prune,
	deleteKeys,
	pushBlocks,
	listSchemas,
	listCollections,
	importBlocks,
	addLanguage,
	setDefaultLanguage,
	listSections,
	addSection,
	renameSection,
	assignKeysToSection,
	assignMediaToSection,
	removeSection,
	createLegalDraft,
	updateLegalDraft,
	publish,
	check,
} from '@upbeat-works/edgecms-sdk';
```

### Bootstrapping a new CMS from CI

```bash
edgecms languages:add en          # Create the default locale
edgecms languages:add es
edgecms blocks:push               # Create the schemas and collections
edgecms push                      # Upload translations into the draft
edgecms prune                     # Report keys the codebase no longer uses
edgecms check                     # Fail the build if anything is untranslated
edgecms publish --wait            # Go live
```

Every command above is safe to re-run: `languages:add`, `blocks:push` and `push`
create what's missing and leave the rest alone, and `prune` only reports until
someone passes `--yes`.

## Routes

### Admin Routes (Protected)

| Route                         | Description                    |
| ----------------------------- | ------------------------------ |
| `/edge-cms/sign-in`           | Authentication                 |
| `/edge-cms/sign-up`           | Admin registration             |
| `/edge-cms/i18n`              | Translation management         |
| `/edge-cms/i18n/versions`     | Version management             |
| `/edge-cms/blocks`            | Block schema & collection mgmt |
| `/edge-cms/media`             | Media upload & management      |
| `/edge-cms/sections`          | Section management             |
| `/edge-cms/users`             | User management                |
| `/edge-cms/settings/api-keys` | API key management             |

### Public API Routes

| Route                                     | Description                        |
| ----------------------------------------- | ---------------------------------- |
| `GET /edge-cms/public/i18n/:locale.json`  | Translations for a locale (cached) |
| `GET /edge-cms/public/media/:filename`    | Serve media files from R2          |
| `GET /edge-cms/public/blocks/:collection` | Block collection data              |

### SDK API Routes (API Key Required)

| Route                                    | Method | Description                                  |
| ---------------------------------------- | ------ | -------------------------------------------- |
| `/edge-cms/api/i18n/pull`                | GET    | Fetch translations                           |
| `/edge-cms/api/i18n/push`                | POST   | Create/update translations                   |
| `/edge-cms/api/i18n/languages`           | GET    | List available languages                     |
| `/edge-cms/api/i18n/languages`           | POST   | Create a language                            |
| `/edge-cms/api/i18n/languages`           | PATCH  | Set the default language                     |
| `/edge-cms/api/i18n/missing`             | GET    | Report untranslated keys                     |
| `/edge-cms/api/i18n/stale`               | GET    | Report translations the source has outrun    |
| `/edge-cms/api/i18n/keys`                | DELETE | Delete translation keys (dry run by default) |
| `/edge-cms/api/sections`                 | GET    | List sections                                |
| `/edge-cms/api/sections`                 | POST   | Create a section                             |
| `/edge-cms/api/sections`                 | PUT    | Assign existing i18n keys or media           |
| `/edge-cms/api/sections`                 | PATCH  | Rename a section                             |
| `/edge-cms/api/sections`                 | DELETE | Delete a section (dry run by default)        |
| `/edge-cms/api/blocks/import`            | POST   | Bulk import blocks                           |
| `/edge-cms/api/blocks/schemas`           | GET    | List schemas and their properties            |
| `/edge-cms/api/blocks/schemas`           | POST   | Create a schema, or add missing properties   |
| `/edge-cms/api/blocks/collections`       | GET    | List collections                             |
| `/edge-cms/api/blocks/collections`       | POST   | Create a collection                          |
| `/edge-cms/api/legal`                    | POST   | Create a legal document with one draft       |
| `/edge-cms/api/legal/:id/drafts/:locale` | PUT    | Replace one localized legal draft            |
| `/edge-cms/api/publish`                  | POST   | Release the draft (returns a `publishId`)    |
| `/edge-cms/api/publish`                  | GET    | Status of a release, via `?id=<publishId>`   |

Errors share a shape: `{ "error": "...", "code": "MACHINE_READABLE_CODE" }`.

### Service Bindings (Worker-to-Worker RPC)

Workers in the same Cloudflare account can skip HTTP and API keys entirely by
binding to the `EdgeCMSService` RPC entrypoint. A service binding is already an
authenticated, account-private channel.

```jsonc
// consumer's wrangler.jsonc
"services": [
  { "binding": "EDGECMS", "service": "edgecms", "entrypoint": "EdgeCMSService" }
]
```

```typescript
// Reads — served from the live published snapshot
const translations = await env.EDGECMS.getTranslations('en');
const blocks = await env.EDGECMS.getBlocks('hero-blocks');
const media = await env.EDGECMS.getMedia('logo.png'); // { contentType, size, etag, body }
const { languages, defaultLocale } = await env.EDGECMS.getLanguages();
const draft = await env.EDGECMS.pullTranslations();
const missing = await env.EDGECMS.missingTranslations();
const stale = await env.EDGECMS.staleTranslations();

// Writes
await env.EDGECMS.createLanguage('pt-BR', { makeDefault: false });
await env.EDGECMS.setDefaultLanguage('pt-BR');
await env.EDGECMS.applyBlockSchema('hero', [
	{ name: 'title', type: 'translation' },
]);
await env.EDGECMS.createBlockCollection({
	name: 'homepage-hero',
	schema: 'hero',
});
await env.EDGECMS.deleteTranslationKeys(['home.hero.oldTitle'], {
	dryRun: false,
});
const { publishId } = await env.EDGECMS.publish();
const state = await env.EDGECMS.publishStatus(publishId);
```

RPC methods throw on failure instead of returning status codes, with
`error.name` carrying the same code the REST API returns (`LOCALE_EXISTS`,
`NO_DRAFT`, `NO_DEFAULT_LANGUAGE`, `COLLECTION_NOT_FOUND`, …). Both surfaces
call the same service layer, so validation and preconditions cannot drift apart.

## Usage

### Managing Translations

1. Sign in at `/edge-cms/sign-in`
2. Navigate to `/edge-cms/i18n`
3. Add languages and sections as needed
4. Add translation keys and edit inline — changes auto-save
5. Use versions to publish drafts or rollback changes

Cells flagged in amber were translated from a default-locale value that has
since changed. Rewrite one to clear the flag, or confirm it with the ⚠ button to
keep the text as it stands.

**AI Translate** offers two scopes, because they are not the same decision:

| Scope                          | Covers                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Untranslated keys              | Keys a locale never answered, or answered with an empty value                 |
| Untranslated and outdated keys | The above, plus translations whose source text changed — **overwriting them** |

The second scope replaces existing translations, including ones written by hand,
so it is never the default and never implied.

### Consuming Translations

```javascript
const response = await fetch('/edge-cms/public/i18n/en.json');
const translations = await response.json();
```

Or use the SDK for type-safe access:

```bash
edgecms pull
```

### Managing Content Blocks

1. Navigate to `/edge-cms/blocks`
2. Create a block schema with typed properties
3. Create a collection (singleton or multi-instance)
4. Add block instances with content
5. Publish when ready

### Consuming Content Blocks

```javascript
const response = await fetch('/edge-cms/public/blocks/hero');
const { items } = await response.json();
```

### Managing Media

1. Navigate to `/edge-cms/media`
2. Upload files — they're automatically sanitized to kebab-case
3. Organize with sections
4. Reference directly in your app:

```html
<img src="/edge-cms/public/media/my-image.jpg" alt="My Image" />
```

### API Keys

1. Go to `/edge-cms/settings/api-keys`
2. Create a key with a descriptive name
3. Set custom rate limits if needed
4. Use the key in `EDGECMS_API_KEY` for SDK access

## Data Model

### Languages

| Field     | Description                           |
| --------- | ------------------------------------- |
| `locale`  | Language code (e.g., `en`, `es`)      |
| `default` | Whether this is the fallback language |

### Sections

| Field  | Description                             |
| ------ | --------------------------------------- |
| `name` | Section identifier for grouping content |

### Translations

| Field        | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `key`        | Translation key                                               |
| `language`   | Language code                                                 |
| `value`      | Translated text                                               |
| `sourceHash` | Fingerprint of the default-locale value this was written from |
| `section`    | Optional section reference                                    |
| `state`      | `draft` or `live`                                             |
| `version`    | Version number                                                |

A translation is stale when its `sourceHash` no longer matches the one the
default-locale row carries. Only the row being edited is ever written, so
changing a default value costs one write no matter how many locales it
invalidates.

### Media

| Field       | Description                |
| ----------- | -------------------------- |
| `filename`  | Sanitized filename         |
| `mimeType`  | File MIME type             |
| `sizeBytes` | File size                  |
| `section`   | Optional section reference |
| `state`     | `draft` or `live`          |
| `version`   | Version number             |

### Block Schemas

| Field  | Description                                                                                  |
| ------ | -------------------------------------------------------------------------------------------- |
| `name` | Schema identifier                                                                            |
| `type` | Property types: `string`, `number`, `boolean`, `translation`, `media`, `block`, `collection` |

### Block Collections

| Field    | Description                 |
| -------- | --------------------------- |
| `name`   | Collection identifier       |
| `schema` | Associated block schema     |
| `type`   | `singleton` or `collection` |

### Block Instances

| Field        | Description                         |
| ------------ | ----------------------------------- |
| `collection` | Parent collection                   |
| `values`     | Property values matching the schema |
| `state`      | `draft` or `live`                   |
| `version`    | Version number                      |

## Integration

EdgeCMS is designed to run alongside your existing Cloudflare Workers app. Mount
it under `/edge-cms` and you're good to go — your CMS lives where your code
does, on the edge.

## Extensions

EdgeCMS supports project-specific admin pages through a small extension API.
Register custom routes under `/edge-cms/custom/*` and add links to the header
nav by editing `app/extension.ts`. Extension routes are mounted inside the
EdgeCMS layout, so they inherit auth, theme, and styling automatically.

See [docs/extensions.md](./docs/extensions.md) for the full guide.

## License

See [LICENSE.md](./LICENSE.md).
