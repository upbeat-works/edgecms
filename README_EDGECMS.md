# EdgeCMS - Cloudflare Workers CMS

A lightweight content management system built on Cloudflare Workers, using D1 for data storage, KV for caching, and R2 for media storage.

## Features

- **Internationalization (i18n) Management**
  - Multi-language support with fallback to default language
  - Inline editing of translations
  - Section-based organization
  - Cached API endpoints for performance

- **Media Management**
  - Upload files to R2 storage
  - Automatic filename sanitization (kebab-case)
  - Section-based organization
  - Direct streaming from R2

- **Authentication**
  - Email/password authentication using Better Auth
  - Session management with D1 storage
  - Protected routes

## Stack

- **Framework**: React Router v7
- **UI**: Tailwind CSS + shadcn/ui components
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Storage**: Cloudflare R2
- **Authentication**: Better Auth
- **Runtime**: Cloudflare Workers

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Cloudflare Resources

Create the required Cloudflare resources:

```bash
# Create D1 database
npx wrangler d1 create edgecms-db

# Create KV namespace
npx wrangler kv:namespace create CACHE

# Create R2 bucket
npx wrangler r2 bucket create edgecms-media
```

### 3. Update wrangler.jsonc

Update the IDs in `wrangler.jsonc` with the actual IDs from the commands above:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "edgecms-db",
      "database_id": "YOUR_DATABASE_ID" // Replace with actual ID
    }
  ],
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "YOUR_KV_NAMESPACE_ID" // Replace with actual ID
    }
  ],
  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "edgecms-media"
    }
  ]
}
```

### 4. Set Environment Variables

Create a `.dev.vars` file for local development:

```env
AUTH_SECRET=your-secret-key-here
BASE_URL=http://localhost:5173
```

For production, set these as Cloudflare secrets:

```bash
npx wrangler secret put AUTH_SECRET
```

### 5. Run Migrations

Apply the database migrations:

```bash
npx wrangler d1 migrations apply edgecms-db --local
```

For production:

```bash
npx wrangler d1 migrations apply edgecms-db
```

### 6. Create Admin User

Create an admin user for accessing the CMS:

```bash
npm run create-user admin@example.com password123 "Admin User"
```

Or use the script directly:

```bash
node scripts/create-user.js admin@example.com password123 "Admin User"
```

### 7. Generate Types

Generate TypeScript types:

```bash
npm run typecheck
```

## Development

Start the development server:

```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Routes

### Admin Routes (Protected)

- `/edge-cms/sign-in` - Authentication page
- `/edge-cms/i18n` - Translation management interface
- `/edge-cms/media` - Media upload and management

### Public API Routes

- `/edge-cms/public/i18n/:locale.json` - Get translations for a locale (cached)
- `/edge-cms/public/media/:filename` - Serve media files from R2

## Usage

### Managing Translations

1. Sign in at `/edge-cms/sign-in`
2. Navigate to `/edge-cms/i18n`
3. Add languages and sections as needed
4. Add translation keys
5. Edit translations inline - changes save automatically

### Consuming Translations

Fetch translations from your application:

```javascript
const response = await fetch('/edge-cms/public/i18n/en.json');
const translations = await response.json();
```

### Managing Media

1. Navigate to `/edge-cms/media`
2. Upload files using the upload button
3. Files are automatically renamed to kebab-case
4. Assign files to sections for organization

### Using Media

Reference media files directly:

```html
<img src="/edge-cms/public/media/my-image.jpg" alt="My Image" />
```

## Data Model

### Languages
- `locale` - Language code (e.g., 'en', 'es')
- `default` - Whether this is the default/fallback language

### Sections
- `name` - Section identifier for grouping content

### Translations
- `key` - Translation key
- `language` - Language code
- `value` - Translated text
- `section` - Optional section reference

### Media
- `filename` - Sanitized filename
- `mimeType` - File MIME type
- `sizeBytes` - File size
- `section` - Optional section reference

## Integration

This CMS is designed to be deployed alongside your existing Cloudflare Workers application. Simply configure the `/edge-cms` routes in your wrangler configuration to serve this application on your domain. 