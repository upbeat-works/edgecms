-- Block schema definitions (templates)
CREATE TABLE block_schemas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Property definitions for each schema
CREATE TABLE block_schema_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schemaId INTEGER NOT NULL REFERENCES block_schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('string', 'media', 'boolean', 'block', 'collection')),
  refSchemaId INTEGER REFERENCES block_schemas(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(schemaId, name)
);

-- Collections (root-level containers for block instances)
CREATE TABLE block_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  schemaId INTEGER NOT NULL REFERENCES block_schemas(id) ON DELETE RESTRICT,
  section TEXT REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Block instances (actual data)
CREATE TABLE block_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schemaId INTEGER NOT NULL REFERENCES block_schemas(id) ON DELETE CASCADE,
  collectionId INTEGER REFERENCES block_collections(id) ON DELETE CASCADE,
  parentInstanceId INTEGER REFERENCES block_instances(id) ON DELETE CASCADE,
  parentPropertyId INTEGER REFERENCES block_schema_properties(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Property values for instances (boolean and media only - strings use translations table)
CREATE TABLE block_instance_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instanceId INTEGER NOT NULL REFERENCES block_instances(id) ON DELETE CASCADE,
  propertyId INTEGER NOT NULL REFERENCES block_schema_properties(id) ON DELETE CASCADE,
  booleanValue INTEGER,
  mediaId INTEGER REFERENCES media(id) ON DELETE SET NULL,
  UNIQUE(instanceId, propertyId)
);

-- Indexes for performance
CREATE INDEX idx_block_schema_properties_schema ON block_schema_properties(schemaId);
CREATE INDEX idx_block_collections_schema ON block_collections(schemaId);
CREATE INDEX idx_block_collections_section ON block_collections(section);
CREATE INDEX idx_block_instances_collection ON block_instances(collectionId);
CREATE INDEX idx_block_instances_parent ON block_instances(parentInstanceId);
CREATE INDEX idx_block_instances_schema ON block_instances(schemaId);
CREATE INDEX idx_block_instance_values_instance ON block_instance_values(instanceId);
CREATE INDEX idx_block_instance_values_media ON block_instance_values(mediaId);
