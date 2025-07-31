-- Add foreign key constraints for sections with CASCADE behavior
-- This migration recreates the tables with proper foreign key references

-- Recreate Translations table with foreign key constraint
CREATE TABLE "translations_new" (
  "key" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "section" TEXT,
  FOREIGN KEY ("section") REFERENCES "sections"("name") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "translations_new" (key, language, value, section)
SELECT key, language, value, section FROM "translations";

-- Drop old table and rename new one
DROP TABLE "translations";
ALTER TABLE "translations_new" RENAME TO "translations";

-- Recreate Media table with foreign key constraint
CREATE TABLE "media_new" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "filename" TEXT UNIQUE NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "section" TEXT,
  "uploadedAt" TEXT DEFAULT 'CURRENT_TIMESTAMP',
  FOREIGN KEY ("section") REFERENCES "sections"("name") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "media_new" (id, filename, mimeType, sizeBytes, section, uploadedAt)
SELECT id, filename, mimeType, sizeBytes, section, uploadedAt FROM "media";

-- Drop old table and rename new one
DROP TABLE "media";
ALTER TABLE "media_new" RENAME TO "media"; 