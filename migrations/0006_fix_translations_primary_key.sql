-- Fix missing primary key constraint on Translations table
-- SQLite doesn't allow adding PRIMARY KEY to existing table, so we need to recreate it

-- Create new table with correct structure
CREATE TABLE Translations_new (
  key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  section TEXT,
  PRIMARY KEY (language, key),
  FOREIGN KEY (language) REFERENCES Languages(locale),
  FOREIGN KEY (section) REFERENCES Sections(name) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data from old table
INSERT INTO Translations_new (key, language, value, section)
SELECT key, language, value, section FROM Translations;

-- Drop old table
DROP TABLE Translations;

-- Rename new table
ALTER TABLE Translations_new RENAME TO Translations;

-- Recreate index on key for faster queries
CREATE INDEX idx_translations_key ON Translations(key); 