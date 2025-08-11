-- Add version column to media table and update unique constraints
-- Step 1: Add version column
ALTER TABLE media ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Step 2: Create new table with updated constraints
CREATE TABLE media_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  section TEXT REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE,
  state TEXT DEFAULT 'live',
  uploadedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1
);

-- Step 3: Copy data from old table
INSERT INTO media_new (id, filename, mimeType, sizeBytes, section, state, uploadedAt, version)
SELECT id, filename, mimeType, sizeBytes, section, state, uploadedAt, version FROM media;

-- Step 4: Drop old table and rename new one
DROP TABLE media;
ALTER TABLE media_new RENAME TO media;

-- Step 5: Create unique index on filename + version
CREATE UNIQUE INDEX idx_media_filename_version ON media(filename, version);
