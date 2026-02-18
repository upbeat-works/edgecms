-- Add API key table for better-auth apiKey plugin
CREATE TABLE IF NOT EXISTS apikey (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    start TEXT,
    prefix TEXT,
    key TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    refillInterval INTEGER,
    refillAmount INTEGER,
    lastRefillAt INTEGER,
    enabled INTEGER DEFAULT 1 NOT NULL,
    rateLimitEnabled INTEGER DEFAULT 1 NOT NULL,
    rateLimitTimeWindow INTEGER,
    rateLimitMax INTEGER,
    requestCount INTEGER DEFAULT 0 NOT NULL,
    remaining INTEGER,
    lastRequest INTEGER,
    expiresAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    permissions TEXT,
    metadata TEXT
);

-- Index for faster lookups by userId
CREATE INDEX IF NOT EXISTS idx_apikey_userId ON apikey(userId);
