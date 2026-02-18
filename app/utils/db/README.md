# Database Operations Modules

This directory contains domain-specific database operations, refactored from the monolithic `db.server.ts` file.

## Structure

- **types.ts** - Shared TypeScript interfaces for database models
- **languages.server.ts** - Language operations (getLanguages, createLanguage, setDefaultLanguage)
- **sections.server.ts** - Section operations (getSections, createSection, updateSection, deleteSection, getSectionsWithCounts)
- **translations.server.ts** - Translation operations (getTranslations, upsertTranslation, bulkUpsertTranslations, etc.)
- **media.server.ts** - Media operations (getMedia, createMedia, updateMediaSection, markMediaLive, etc.)
- **versions.server.ts** - Version operations (getVersions, createVersion, promoteVersion, rollbackVersion, etc.)
- **blocks.server.ts** - Block operations (schemas, collections, instances, properties, values)
- **users.server.ts** - User operations (getHasAdmin)
- **index.server.ts** - Re-exports all operations for backwards compatibility

## Usage

Import from the main `db.server.ts` file (recommended):

```typescript
import { getLanguages, createSection, upsertTranslation } from '~/utils/db.server';
```

Or import from specific modules:

```typescript
import { getLanguages } from '~/utils/db/languages.server';
import { createSection } from '~/utils/db/sections.server';
import { upsertTranslation } from '~/utils/db/translations.server';
```

## Backwards Compatibility

The original `db.server.ts` file now simply re-exports everything from `./db/index.server.ts`, maintaining full backwards compatibility with existing code.
