-- Fix datetime columns for Better Auth compatibility
-- SQLite doesn't have ALTER COLUMN, so we need to recreate the table

-- Create new user table with TEXT datetime columns
CREATE TABLE "user_new" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "name" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- Copy existing data (if any) with datetime conversion
INSERT INTO "user_new" (id, email, emailVerified, name, createdAt, updatedAt)
SELECT id, email, emailVerified, name, 
       COALESCE(datetime(createdAt, 'utc'), datetime('now', 'utc')) as createdAt,
       COALESCE(datetime(updatedAt, 'utc'), datetime('now', 'utc')) as updatedAt
FROM "user";

-- Drop old table and rename new one
DROP TABLE "user";
ALTER TABLE "user_new" RENAME TO "user";

-- Update session table
CREATE TABLE "session_new" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TEXT NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

INSERT INTO "session_new" (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
SELECT id, expiresAt, token,
       COALESCE(datetime(createdAt, 'utc'), datetime('now', 'utc')) as createdAt,
       COALESCE(datetime(updatedAt, 'utc'), datetime('now', 'utc')) as updatedAt,
       ipAddress, userAgent, userId
FROM "session";

DROP TABLE "session";
ALTER TABLE "session_new" RENAME TO "session";

-- Update account table
CREATE TABLE "account_new" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TEXT,
  "refreshTokenExpiresAt" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

INSERT INTO "account_new" (id, accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt)
SELECT id, accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password,
       COALESCE(datetime(createdAt, 'utc'), datetime('now', 'utc')) as createdAt,
       COALESCE(datetime(updatedAt, 'utc'), datetime('now', 'utc')) as updatedAt
FROM "account";

DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";

-- Update verification table
CREATE TABLE "verification_new" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

INSERT INTO "verification_new" (id, identifier, value, expiresAt, createdAt, updatedAt)
SELECT id, identifier, value, expiresAt,
       COALESCE(datetime(createdAt, 'utc'), datetime('now', 'utc')) as createdAt,
       COALESCE(datetime(updatedAt, 'utc'), datetime('now', 'utc')) as updatedAt
FROM "verification";

DROP TABLE "verification";
ALTER TABLE "verification_new" RENAME TO "verification"; 