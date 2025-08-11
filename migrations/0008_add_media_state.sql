-- Add state column to media to track live vs archived
ALTER TABLE media ADD COLUMN state TEXT NOT NULL DEFAULT 'live';

-- Ensure any existing rows have a value
UPDATE media SET state = 'live' WHERE state IS NULL;


