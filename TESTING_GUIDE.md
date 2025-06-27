# EdgeCMS Testing Guide

## 🚀 Quick Start

Your EdgeCMS testing environment is now fully configured on the Upbeat SL Cloudflare account!

### Resources Created

- **D1 Database**: `edgecms-db` (ID: 73defcff-5a27-408b-bb3b-41cb31b17698)
- **KV Namespace**: `CACHE` (ID: 1c545352faed4be8b4029683188183b7)
- **R2 Bucket**: `edgecms-media`
- **Test Data**: Pre-populated with languages, sections, and translations

### Local Development

1. **Start the dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Access the application**:
   - Home: http://localhost:5173
   - Sign In: http://localhost:5173/edge-cms/sign-in
   - Translations: http://localhost:5173/edge-cms/i18n
   - Media: http://localhost:5173/edge-cms/media

### Authentication

- On first sign-in, enter any email and password
- The system will automatically create a user account
- Subsequent logins will use the same credentials

### Test Data Available

**Languages:**
- English (en) - Default
- Spanish (es)
- French (fr)

**Sections:**
- homepage
- dashboard
- settings

**Sample Translations:**
- `welcome.title` - Available in all 3 languages
- `dashboard.title` - Dashboard titles
- `button.save`, `button.cancel` - Common UI elements

### Testing Features

1. **Translation Management**:
   - Edit translations inline (auto-saves on blur)
   - Filter by section
   - Add new languages/sections/translations
   - View missing translations

2. **Media Management**:
   - Upload files (automatically renamed to kebab-case)
   - Organize by sections
   - Preview images/videos
   - Direct streaming from R2

3. **Public APIs**:
   - Get translations: http://localhost:5173/edge-cms/public/i18n/en.json
   - Try other locales: es.json, fr.json
   - Media files: http://localhost:5173/edge-cms/public/media/[filename]

### Production Deployment

To deploy to production:

```bash
npm run deploy
```

The application will be available at your worker URL:
- https://edgecms.upbeat-sl.workers.dev

### Troubleshooting

1. **Database Issues**:
   ```bash
   # Reset local database
   rm -rf .wrangler/state/v3/d1
   npx wrangler d1 migrations apply edgecms-db --local
   npx wrangler d1 execute edgecms-db --local --file scripts/seed-data.sql
   ```

2. **TypeScript Errors**:
   ```bash
   npm run typecheck
   ```

3. **View Logs**:
   ```bash
   npx wrangler tail
   ```

### API Examples

**Fetch translations with cURL:**
```bash
# Get English translations
curl http://localhost:5173/edge-cms/public/i18n/en.json

# Get Spanish translations
curl http://localhost:5173/edge-cms/public/i18n/es.json
```

**Response format:**
```json
{
  "welcome.title": "Welcome to EdgeCMS",
  "welcome.subtitle": "Manage your content with ease",
  "button.save": "Save",
  // ... more translations
}
```

### Next Steps

1. Test all CRUD operations for translations
2. Upload some test media files
3. Test the caching behavior (translations are cached for 24h)
4. Try the sign-out functionality
5. Deploy to production when ready

Enjoy your EdgeCMS! 🎉 