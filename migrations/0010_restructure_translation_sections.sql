-- Restructure translation sections relationship
-- Create a new table to relate translation keys with sections

-- Step 1: Create the new translation_keys table
CREATE TABLE translation_keys (
  key TEXT PRIMARY KEY,
  section TEXT REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Step 2: Populate translation_keys with unique keys and their sections
INSERT INTO translation_keys (key, section)
SELECT DISTINCT key, section 
FROM translations 
WHERE key IS NOT NULL;

-- Step 3: Create new translations table without section column
CREATE TABLE translations_new (
  key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (language, key),
  FOREIGN KEY (language) REFERENCES languages(locale) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (key) REFERENCES translation_keys(key) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 4: Copy translation data (without section column)
INSERT INTO translations_new (key, language, value)
SELECT key, language, value 
FROM translations;

-- Step 5: Drop old translations table and rename new one
DROP TABLE translations;
ALTER TABLE translations_new RENAME TO translations;

-- Step 6: Create indexes for better performance
CREATE INDEX idx_translations_key ON translations(key);
CREATE INDEX idx_translation_keys_section ON translation_keys(section);
