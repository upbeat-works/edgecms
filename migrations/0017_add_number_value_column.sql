-- Add numberValue REAL column to block_instance_values
ALTER TABLE block_instance_values ADD COLUMN numberValue REAL;

-- Add 'number' to the type CHECK constraint on block_schema_properties
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

CREATE TABLE block_schema_properties_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schemaId INTEGER NOT NULL REFERENCES block_schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('string', 'number', 'translation', 'media', 'boolean', 'block', 'collection')),
  refSchemaId INTEGER REFERENCES block_schemas(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(schemaId, name)
);

INSERT INTO block_schema_properties_new (id, schemaId, name, type, refSchemaId, position)
SELECT id, schemaId, name, type, refSchemaId, position
FROM block_schema_properties;

DROP TABLE block_schema_properties;

ALTER TABLE block_schema_properties_new RENAME TO block_schema_properties;

CREATE INDEX idx_block_schema_properties_schema ON block_schema_properties(schemaId);

-- Migrate existing number data from stringValue to numberValue
UPDATE block_instance_values
SET numberValue = CAST(stringValue AS REAL),
    stringValue = NULL
WHERE propertyId IN (
    SELECT id FROM block_schema_properties WHERE type = 'number'
);
