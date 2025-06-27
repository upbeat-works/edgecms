-- Convert TEXT timestamps to INTEGER unix timestamps for Drizzle timestamp mode
-- This allows Better Auth Date objects to be properly handled

-- Convert user table
CREATE TABLE "user_new" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "name" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

-- Copy data and convert TEXT dates to unix timestamps
INSERT INTO "user_new" (id, email, emailVerified, name, createdAt, updatedAt)
SELECT id, email, emailVerified, name, 
       CAST(strftime('%s', createdAt) AS INTEGER) as createdAt,
       CAST(strftime('%s', updatedAt) AS INTEGER) as updatedAt
FROM "user";

DROP TABLE "user";
ALTER TABLE "user_new" RENAME TO "user";

-- Convert session table
CREATE TABLE "session_new" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

INSERT INTO "session_new" (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
SELECT id, 
       CAST(strftime('%s', expiresAt) AS INTEGER) as expiresAt,
       token,
       CAST(strftime('%s', createdAt) AS INTEGER) as createdAt,
       CAST(strftime('%s', updatedAt) AS INTEGER) as updatedAt,
       ipAddress, userAgent, userId
FROM "session";

DROP TABLE "session";
ALTER TABLE "session_new" RENAME TO "session";

-- Convert account table
CREATE TABLE "account_new" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

INSERT INTO "account_new" (id, accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt)
SELECT id, accountId, providerId, userId, accessToken, refreshToken, idToken,
       CASE WHEN accessTokenExpiresAt IS NOT NULL THEN CAST(strftime('%s', accessTokenExpiresAt) AS INTEGER) ELSE NULL END as accessTokenExpiresAt,
       CASE WHEN refreshTokenExpiresAt IS NOT NULL THEN CAST(strftime('%s', refreshTokenExpiresAt) AS INTEGER) ELSE NULL END as refreshTokenExpiresAt,
       scope, password,
       CAST(strftime('%s', createdAt) AS INTEGER) as createdAt,
       CAST(strftime('%s', updatedAt) AS INTEGER) as updatedAt
FROM "account";

DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";

-- Convert verification table
CREATE TABLE "verification_new" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

INSERT INTO "verification_new" (id, identifier, value, expiresAt, createdAt, updatedAt)
SELECT id, identifier, value,
       CAST(strftime('%s', expiresAt) AS INTEGER) as expiresAt,
       CAST(strftime('%s', createdAt) AS INTEGER) as createdAt,
       CAST(strftime('%s', updatedAt) AS INTEGER) as updatedAt
FROM "verification";

DROP TABLE "verification";
ALTER TABLE "verification_new" RENAME TO "verification"; 