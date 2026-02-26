# EdgeCMS

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/upbeat-works/edgecms)

Your content, on the edge. EdgeCMS is a headless content management system that
runs entirely on Cloudflare Workers — no origin servers, no cold starts, no
nonsense. Ship i18n, media, and structured content blocks from the fastest
infrastructure on the planet.

## Why EdgeCMS?

- **Zero-origin architecture** — D1 for storage, KV for caching, R2 for media.
  Everything runs at the edge.
- **Drop-in ready** — Deploy alongside your existing Cloudflare Workers app.
  All routes live under `/edge-cms`.
- **Type-safe SDK** — Pull translations, generate TypeScript types, and import
  content blocks from the CLI. Your IDE stays happy.
- **Version control for content** — Draft, publish, rollback. Treat your content
  like code.
- **AI-powered translations** — Auto-translate missing keys with OpenAI. Ship
  faster in every language.

## Features

### Internationalization (i18n)

- Multi-language support with fallback to default locale
- Inline editing with auto-save — no submit buttons, no friction
- Section-based organization for large translation sets
- Draft/live versioning with publish and rollback
- AI-powered auto-translation for missing keys
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

### Version Control

- Draft and live content states
- Publish drafts with Cloudflare Workflows
- Rollback to any previous version instantly
- Version descriptions for change tracking

## Stack

| Layer          | Technology                     |
| -------------- | ------------------------------ |
| Framework      | React Router v7                |
| UI             | Tailwind CSS 4 + shadcn/ui    |
| Database       | Cloudflare D1 (SQLite)         |
| ORM            | Drizzle                        |
| Cache          | Cloudflare KV                  |
| Storage        | Cloudflare R2                  |
| Auth           | Better Auth                    |
| AI             | OpenAI (via AI SDK)            |
| Workflows      | Cloudflare Workflows           |
| Runtime        | Cloudflare Workers             |

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
```

For production, set these as Cloudflare secrets:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_SIGNUP_PASSWORD
npx wrangler secret put OPENAI_API_KEY
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
      "migrations_dir": "./migrations"
    }
  ],

  // KV Cache
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "<your-kv-namespace-id>"
    }
  ],

  // R2 Storage
  "r2_buckets": [
    { "binding": "MEDIA_BUCKET", "bucket_name": "edgecms-media" },
    { "binding": "BACKUPS_BUCKET", "bucket_name": "edgecms-backups" }
  ],

  // Workflows
  "workflows": [
    {
      "name": "edgecms-release-version-workflow",
      "binding": "RELEASE_VERSION_WORKFLOW",
      "class_name": "ReleaseVersionWorkflow"
    },
    {
      "name": "edgecms-rollback-version-workflow",
      "binding": "ROLLBACK_VERSION_WORKFLOW",
      "class_name": "RollbackVersionWorkflow"
    },
    {
      "name": "edgecms-ai-translate-workflow",
      "binding": "AI_TRANSLATE_WORKFLOW",
      "class_name": "AITranslateWorkflow"
    }
  ],

  // Environment
  "vars": {
    "BASE_URL": "https://your-domain.com",
    "TRUSTED_ORIGINS": "https://your-domain.com"
  }
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

#### `edgecms import-blocks`

Bulk import block instances from a JSON file.

```bash
edgecms import-blocks ./data.json "hero-blocks"
edgecms import-blocks ./data.json "carousel" --locale "es"
```

### Programmatic Usage

```typescript
import { pull, push, importBlocks } from '@upbeat-works/edgecms-sdk';
```

## Routes

### Admin Routes (Protected)

| Route                          | Description                    |
| ------------------------------ | ------------------------------ |
| `/edge-cms/sign-in`            | Authentication                 |
| `/edge-cms/sign-up`            | Admin registration             |
| `/edge-cms/i18n`               | Translation management         |
| `/edge-cms/i18n/versions`      | Version management             |
| `/edge-cms/blocks`             | Block schema & collection mgmt |
| `/edge-cms/media`              | Media upload & management      |
| `/edge-cms/sections`           | Section management             |
| `/edge-cms/users`              | User management                |
| `/edge-cms/settings/api-keys`  | API key management             |

### Public API Routes

| Route                                    | Description                         |
| ---------------------------------------- | ----------------------------------- |
| `GET /edge-cms/public/i18n/:locale.json` | Translations for a locale (cached)  |
| `GET /edge-cms/public/media/:filename`   | Serve media files from R2           |
| `GET /edge-cms/public/blocks/:collection`| Block collection data               |

### SDK API Routes (API Key Required)

| Route                             | Method | Description                |
| --------------------------------- | ------ | -------------------------- |
| `/edge-cms/api/i18n/pull`         | GET    | Fetch translations         |
| `/edge-cms/api/i18n/push`         | POST   | Create/update translations |
| `/edge-cms/api/i18n/languages`    | GET    | List available languages   |
| `/edge-cms/api/blocks/import`     | POST   | Bulk import blocks         |

## Usage

### Managing Translations

1. Sign in at `/edge-cms/sign-in`
2. Navigate to `/edge-cms/i18n`
3. Add languages and sections as needed
4. Add translation keys and edit inline — changes auto-save
5. Use versions to publish drafts or rollback changes

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

| Field     | Description                             |
| --------- | --------------------------------------- |
| `locale`  | Language code (e.g., `en`, `es`)        |
| `default` | Whether this is the fallback language   |

### Sections

| Field  | Description                              |
| ------ | ---------------------------------------- |
| `name` | Section identifier for grouping content  |

### Translations

| Field      | Description                  |
| ---------- | ---------------------------- |
| `key`      | Translation key              |
| `language` | Language code                |
| `value`    | Translated text              |
| `section`  | Optional section reference   |
| `state`    | `draft` or `live`            |
| `version`  | Version number               |

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

| Field  | Description                                                                              |
| ------ | ---------------------------------------------------------------------------------------- |
| `name` | Schema identifier                                                                        |
| `type` | Property types: `string`, `number`, `boolean`, `translation`, `media`, `block`, `collection` |

### Block Collections

| Field    | Description                               |
| -------- | ----------------------------------------- |
| `name`   | Collection identifier                     |
| `schema` | Associated block schema                   |
| `type`   | `singleton` or `collection`               |

### Block Instances

| Field        | Description                          |
| ------------ | ------------------------------------ |
| `collection` | Parent collection                    |
| `values`     | Property values matching the schema  |
| `state`      | `draft` or `live`                    |
| `version`    | Version number                       |

## Integration

EdgeCMS is designed to run alongside your existing Cloudflare Workers app. Mount
it under `/edge-cms` and you're good to go — your CMS lives where your code
does, on the edge.

## License

See [LICENSE.md](./LICENSE.md).
