import {
	sqliteTable,
	text,
	integer,
	real,
	primaryKey,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Better Auth tables
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).default(false),
	name: text('name'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	role: text('role', { enum: ['admin', 'user'] }).default('user'),
	banned: integer('banned', { mode: 'boolean' }).default(false),
	banReason: text('banReason'),
	banExpires: integer('banExpires', { mode: 'timestamp' }),
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonatedBy'),
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
		mode: 'timestamp',
	}),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

// API Key table (better-auth apiKey plugin)
export const apikey = sqliteTable('apikey', {
	id: text('id').primaryKey(),
	name: text('name'),
	start: text('start'),
	prefix: text('prefix'),
	key: text('key').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	refillInterval: integer('refillInterval'),
	refillAmount: integer('refillAmount'),
	lastRefillAt: integer('lastRefillAt', { mode: 'timestamp' }),
	enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
	rateLimitEnabled: integer('rateLimitEnabled', { mode: 'boolean' })
		.default(true)
		.notNull(),
	rateLimitTimeWindow: integer('rateLimitTimeWindow'),
	rateLimitMax: integer('rateLimitMax'),
	requestCount: integer('requestCount').default(0).notNull(),
	remaining: integer('remaining'),
	lastRequest: integer('lastRequest', { mode: 'timestamp' }),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	permissions: text('permissions'),
	metadata: text('metadata'),
});

// Application tables
export const languages = sqliteTable('languages', {
	locale: text('locale').primaryKey(),
	default: integer('default', { mode: 'boolean' }).default(false),
});

export const sections = sqliteTable('sections', {
	name: text('name').primaryKey(),
});

export const translationKeys = sqliteTable('translation_keys', {
	key: text('key').primaryKey(),
	section: text('section').references(() => sections.name, {
		onDelete: 'set null',
		onUpdate: 'cascade',
	}),
});

export const translations = sqliteTable(
	'translations',
	{
		key: text('key')
			.notNull()
			.references(() => translationKeys.key, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		language: text('language')
			.notNull()
			.references(() => languages.locale, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		value: text('value').notNull(),
	},
	table => [primaryKey({ columns: [table.language, table.key] })],
);

export const media = sqliteTable(
	'media',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		filename: text('filename').notNull(),
		mimeType: text('mimeType').notNull(),
		sizeBytes: integer('sizeBytes').notNull(),
		section: text('section').references(() => sections.name, {
			onDelete: 'set null',
			onUpdate: 'cascade',
		}),
		state: text('state', { enum: ['live', 'archived'] })
			.default('live')
			.notNull(),
		uploadedAt: text('uploadedAt')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		version: integer('version').notNull().default(1),
	},
	table => [
		uniqueIndex('idx_media_filename_version').on(table.filename, table.version),
	],
);

// Version management for file-based production
export const versions = sqliteTable('versions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	description: text('description'),
	status: text('status', { enum: ['draft', 'live', 'archived'] }).default(
		'draft',
	),
	createdAt: text('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	createdBy: text('createdBy').references(() => user.id),
});

// Block schema definitions (templates)
export const blockSchemas = sqliteTable('block_schemas', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	createdAt: text('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

// Property definitions for each schema
export const blockSchemaProperties = sqliteTable(
	'block_schema_properties',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		schemaId: integer('schemaId')
			.notNull()
			.references(() => blockSchemas.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		type: text('type', {
			enum: [
				'string',
				'number',
				'translation',
				'media',
				'boolean',
				'block',
				'collection',
			],
		}).notNull(),
		refSchemaId: integer('refSchemaId').references(() => blockSchemas.id, {
			onDelete: 'restrict',
		}),
		position: integer('position').notNull().default(0),
	},
	table => [
		uniqueIndex('idx_schema_property_name').on(table.schemaId, table.name),
	],
);

// Collections (root-level containers for block instances)
export const blockCollections = sqliteTable('block_collections', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	schemaId: integer('schemaId')
		.notNull()
		.references(() => blockSchemas.id, { onDelete: 'restrict' }),
	section: text('section').references(() => sections.name, {
		onDelete: 'set null',
		onUpdate: 'cascade',
	}),
	isCollection: integer('isCollection', { mode: 'boolean' })
		.notNull()
		.default(true),
	createdAt: text('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

// Block instances (actual data)
export const blockInstances = sqliteTable('block_instances', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	schemaId: integer('schemaId')
		.notNull()
		.references(() => blockSchemas.id, { onDelete: 'cascade' }),
	collectionId: integer('collectionId').references(() => blockCollections.id, {
		onDelete: 'cascade',
	}),
	parentInstanceId: integer('parentInstanceId'),
	parentPropertyId: integer('parentPropertyId').references(
		() => blockSchemaProperties.id,
		{ onDelete: 'cascade' },
	),
	position: integer('position').notNull().default(0),
	createdAt: text('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

// Property values for instances (string, boolean and media - translations use translations table)
export const blockInstanceValues = sqliteTable(
	'block_instance_values',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		instanceId: integer('instanceId')
			.notNull()
			.references(() => blockInstances.id, { onDelete: 'cascade' }),
		propertyId: integer('propertyId')
			.notNull()
			.references(() => blockSchemaProperties.id, { onDelete: 'cascade' }),
		stringValue: text('stringValue'),
		booleanValue: integer('booleanValue'),
		numberValue: real('numberValue'),
		mediaId: integer('mediaId').references(() => media.id, {
			onDelete: 'set null',
		}),
	},
	table => [
		uniqueIndex('idx_instance_property_value').on(
			table.instanceId,
			table.propertyId,
		),
	],
);

// Export schema for better-auth
export const authSchema = {
	user,
	session,
	account,
	verification,
	apikey,
};
