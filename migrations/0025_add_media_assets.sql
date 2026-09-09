PRAGMA defer_foreign_keys = ON;

CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  section TEXT REFERENCES sections(name) ON DELETE SET NULL ON UPDATE CASCADE,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO media_assets (id, filename, section, createdAt)
SELECT
  MIN(id),
  filename,
  (
    SELECT current.section
    FROM media current
    WHERE current.filename = grouped.filename
    ORDER BY CASE WHEN current.state = 'live' THEN 0 ELSE 1 END, current.version DESC
    LIMIT 1
  ),
  MIN(uploadedAt)
FROM media grouped
GROUP BY filename;

CREATE TABLE media_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assetId INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'archived')),
  uploadedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(assetId, version)
);

INSERT INTO media_revisions (id, assetId, mimeType, sizeBytes, state, uploadedAt, version)
SELECT media.id, media_assets.id, media.mimeType, media.sizeBytes, media.state, media.uploadedAt, media.version
FROM media
JOIN media_assets ON media_assets.filename = media.filename;

UPDATE media_revisions
SET state = 'archived'
WHERE state = 'live'
  AND id <> (
    SELECT selected.id
    FROM media_revisions selected
    WHERE selected.assetId = media_revisions.assetId
      AND selected.state = 'live'
    ORDER BY selected.version DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX idx_media_one_live_revision
ON media_revisions(assetId)
WHERE state = 'live';

CREATE TABLE block_instance_values_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instanceId INTEGER NOT NULL REFERENCES block_instances(id) ON DELETE CASCADE,
  propertyId INTEGER NOT NULL REFERENCES block_schema_properties(id) ON DELETE CASCADE,
  stringValue TEXT,
  booleanValue INTEGER,
  mediaId INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  numberValue REAL,
  UNIQUE(instanceId, propertyId)
);

INSERT INTO block_instance_values_new (
  id,
  instanceId,
  propertyId,
  stringValue,
  booleanValue,
  mediaId,
  numberValue
)
SELECT
  values_old.id,
  values_old.instanceId,
  values_old.propertyId,
  values_old.stringValue,
  values_old.booleanValue,
  media_assets.id,
  values_old.numberValue
FROM block_instance_values values_old
LEFT JOIN media ON media.id = values_old.mediaId
LEFT JOIN media_assets ON media_assets.filename = media.filename;

DROP TABLE block_instance_values;
ALTER TABLE block_instance_values_new RENAME TO block_instance_values;
CREATE INDEX idx_block_instance_values_instance ON block_instance_values(instanceId);
CREATE INDEX idx_block_instance_values_media ON block_instance_values(mediaId);

DROP TABLE media;

PRAGMA defer_foreign_keys = OFF;
