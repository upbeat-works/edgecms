-- Add translation type and stringValue column for non-translatable strings
-- This allows properties to be either:
-- - 'string': simple text (like names, codes) stored in block_instance_values
-- - 'translation': translatable text stored in translations table

-- Add stringValue column to block_instance_values
ALTER TABLE block_instance_values ADD COLUMN stringValue TEXT;
