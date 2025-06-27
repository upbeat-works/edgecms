-- Add foreign key constraints for sections with CASCADE behavior
-- This migration recreates the tables with proper foreign key references

-- Recreate Translations table with foreign key constraint
CREATE TABLE "Translations_new" (
  "key" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "section" TEXT,
  FOREIGN KEY ("section") REFERENCES "Sections"("name") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "Translations_new" (key, language, value, section)
SELECT key, language, value, section FROM "Translations";

-- Drop old table and rename new one
DROP TABLE "Translations";
ALTER TABLE "Translations_new" RENAME TO "Translations";

-- Recreate Media table with foreign key constraint
CREATE TABLE "Media_new" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "filename" TEXT UNIQUE NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "section" TEXT,
  "uploadedAt" TEXT DEFAULT 'CURRENT_TIMESTAMP',
  FOREIGN KEY ("section") REFERENCES "Sections"("name") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "Media_new" (id, filename, mimeType, sizeBytes, section, uploadedAt)
SELECT id, filename, mimeType, sizeBytes, section, uploadedAt FROM "Media";

-- Drop old table and rename new one
DROP TABLE "Media";
ALTER TABLE "Media_new" RENAME TO "Media"; 