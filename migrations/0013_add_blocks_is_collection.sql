-- Add isCollection column to block_collections to support both singleton and collection blocks
ALTER TABLE block_collections ADD COLUMN isCollection INTEGER NOT NULL DEFAULT 1;

-- Update existing collections to be collections (default behavior)
-- If you want to convert any existing collections to singletons, do it manually after migration
