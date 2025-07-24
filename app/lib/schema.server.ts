import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Better Auth tables
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: 'boolean' }).default(false),
  name: text("name"),
  createdAt: integer("createdAt", { mode: 'timestamp' }).notNull(),
  updatedAt: integer("updatedAt", { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: 'timestamp' }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: 'timestamp' }).notNull(),
  updatedAt: integer("updatedAt", { mode: 'timestamp' }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" })
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: 'timestamp' }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: 'timestamp' }).notNull(),
  updatedAt: integer("updatedAt", { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: 'timestamp' }).notNull(),
  createdAt: integer("createdAt", { mode: 'timestamp' }).notNull(),
  updatedAt: integer("updatedAt", { mode: 'timestamp' }).notNull()
});

// Application tables
export const languages = sqliteTable("languages", {
  locale: text("locale").primaryKey(),
  default: integer("default", { mode: 'boolean' }).default(false)
});

export const sections = sqliteTable("sections", {
  name: text("name").primaryKey()
});

export const translations = sqliteTable("translations", {
  key: text("key").notNull(),
  language: text("language").notNull(),
  value: text("value").notNull(),
  section: text("section").references(() => sections.name, { onDelete: "set null", onUpdate: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.language, table.key] }),
]);

export const media = sqliteTable("media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull().unique(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  section: text("section").references(() => sections.name, { onDelete: "set null", onUpdate: "cascade" }),
  uploadedAt: text("uploadedAt")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Version management for file-based production
export const versions = sqliteTable("versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description"),
  status: text("status", { enum: ["draft", "live", "archived"] }).default("draft"),
  createdAt: text("createdAt")
  .notNull()
  .default(sql`CURRENT_TIMESTAMP`),
  createdBy: text("createdBy")
  .references(() => user.id)
});

// Export schema for better-auth
export const authSchema = {
  user,
  session,
  account,
  verification
};