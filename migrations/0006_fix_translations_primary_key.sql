-- Fix missing primary key constraint on Translations table
-- SQLite doesn't allow adding PRIMARY KEY to existing table, so we need to recreate it

-- Create new table with correct structure
CREATE TABLE translations_new (
  key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  section TEXT,
  PRIMARY KEY (language, key),
  FOREIGN KEY (language) REFERENCES languages(locale),
  FOREIGN KEY (section) REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data from old table
INSERT INTO translations_new (key, language, value, section)
SELECT key, language, value, section FROM translations;

-- Drop old table
DROP TABLE translations;

-- Rename new table
ALTER TABLE translations_new RENAME TO translations;

-- Recreate index on key for faster queries
CREATE INDEX idx_translations_key ON translations(key); 