-- Add 'translation' to the type CHECK constraint
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create new table with correct constraint
CREATE TABLE block_schema_properties_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schemaId INTEGER NOT NULL REFERENCES block_schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('string', 'translation', 'media', 'boolean', 'block', 'collection')),
  refSchemaId INTEGER REFERENCES block_schemas(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(schemaId, name)
);

-- Step 2: Copy data from old table
INSERT INTO block_schema_properties_new (id, schemaId, name, type, refSchemaId, position)
SELECT id, schemaId, name, type, refSchemaId, position
FROM block_schema_properties;

-- Step 3: Drop old table
DROP TABLE block_schema_properties;

-- Step 4: Rename new table
ALTER TABLE block_schema_properties_new RENAME TO block_schema_properties;

-- Step 5: Recreate index
CREATE INDEX idx_block_schema_properties_schema ON block_schema_properties(schemaId);
