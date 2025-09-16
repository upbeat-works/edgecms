-- Add admin plugin fields to better auth tables

-- Add admin fields to user table
ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'user';
ALTER TABLE "user" ADD COLUMN "banned" BOOLEAN DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN "banReason" TEXT;
ALTER TABLE "user" ADD COLUMN "banExpires" DATETIME;

-- Add impersonation field to session table
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

-- Add foreign key constraint for impersonatedBy (references the admin user)
-- Note: We don't add the FK constraint here since it's optional and might cause issues
-- The application logic will handle the relationship validation

-- Create index on role field for faster role-based queries
CREATE INDEX idx_user_role ON "user"("role");

-- Create index on banned field for faster banned user queries
CREATE INDEX idx_user_banned ON "user"("banned");
