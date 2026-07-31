-- better-auth >=1.5 moved the apiKey plugin to @better-auth/api-key and changed
-- the apikey table:
--   * `userId` renamed to `referenceId` (a key may now be owned by a user or an
--     organization, selected by the plugin's `references` option). We do not set
--     `references`, so this remains a user id.
--   * new required `configId` column, defaulting to 'default', used to select
--     between multiple api-key configurations.
--
-- Both columns are indexed by the plugin.

ALTER TABLE apikey RENAME COLUMN userId TO referenceId;

ALTER TABLE apikey ADD COLUMN configId TEXT NOT NULL DEFAULT 'default';

-- SQLite keeps the old index name after RENAME COLUMN; replace it so the name
-- matches the column it covers.
DROP INDEX IF EXISTS idx_apikey_userId;
CREATE INDEX IF NOT EXISTS idx_apikey_referenceId ON apikey(referenceId);
CREATE INDEX IF NOT EXISTS idx_apikey_configId ON apikey(configId);
