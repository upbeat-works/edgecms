-- Add versioning system to support draft/live versions
-- This allows staging to show draft content and production to show live content

-- Create Versions table to track version metadata
CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_live BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (created_by) REFERENCES user(id)
);

-- Add version_id to Translations table
ALTER TABLE translations ADD COLUMN version_id INTEGER REFERENCES versions(id) ON DELETE CASCADE;

-- Add version_id to Media table  
ALTER TABLE media ADD COLUMN version_id INTEGER REFERENCES versions(id) ON DELETE CASCADE;

-- Create indexes for version queries
CREATE INDEX idx_translations_version ON translations(version_id);
CREATE INDEX idx_media_version ON media(version_id);
CREATE INDEX idx_versions_live ON versions(is_live);

-- Insert initial live version (version 1)
INSERT INTO versions (version_number, name, description, is_live, created_at) 
VALUES (1, 'Initial Version', 'Initial live version', TRUE, CURRENT_TIMESTAMP);

-- Update existing data to belong to version 1
UPDATE translations SET version_id = 1 WHERE version_id IS NULL;
UPDATE media SET version_id = 1 WHERE version_id IS NULL;

-- Make version_id NOT NULL after setting initial data
CREATE TABLE translations_new (
  key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  section TEXT,
  version_id INTEGER NOT NULL,
  PRIMARY KEY (language, key),
  FOREIGN KEY (language) REFERENCES languages(locale),
  FOREIGN KEY (section) REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
);

CREATE TABLE media_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  section TEXT,
  uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  version_id INTEGER NOT NULL,
  FOREIGN KEY (section) REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
);

-- Copy data to new tables
INSERT INTO translations_new SELECT * FROM translations;
INSERT INTO media_new SELECT * FROM media;

-- Drop old tables and rename new ones
DROP TABLE translations;
DROP TABLE media;
ALTER TABLE translations_new RENAME TO translations;
ALTER TABLE media_new RENAME TO media;

-- Recreate indexes
CREATE INDEX idx_translations_key ON translations(key);
CREATE INDEX idx_translations_version ON translations(version_id);
CREATE INDEX idx_media_version ON media(version_id); 