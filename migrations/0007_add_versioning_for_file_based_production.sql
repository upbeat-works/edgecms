-- Add versioning system for file-based production
-- This tracks which version is currently live (served from files)

-- Create Versions table to track version metadata
CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdBy TEXT,
  FOREIGN KEY (createdBy) REFERENCES user(id)
);

-- Create indexes for version queries
CREATE INDEX idx_versions_status ON versions(status);

-- Insert initial live version (version 1)
INSERT INTO versions (description, status) 
VALUES ('v1', 'draft'); 