import {
	sqliteTable,
	text,
	integer,
	blob,
	foreignKey,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const c15t_subject = sqliteTable('c15t_subject', {
	id: text('id', { length: 255 }).primaryKey().notNull(),
	externalId: text('externalId'),
	identityProvider: text('identityProvider'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().defaultNow(),
	tenantId: text('tenantId'),
});

export const c15t_subjectRelations = relations(
	c15t_subject,
	({ one, many }) => ({
		consents: many(c15t_consent, {
			relationName: 'consent_subject',
		}),
		auditLogs: many(c15t_auditLog, {
			relationName: 'auditLog_subject',
		}),
	}),
);

export const c15t_domain = sqliteTable('c15t_domain', {
	id: text('id', { length: 255 }).primaryKey().notNull(),
	name: text('name').notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().defaultNow(),
	tenantId: text('tenantId'),
});

export const c15t_domainRelations = relations(c15t_domain, ({ one, many }) => ({
	consents: many(c15t_consent, {
		relationName: 'consent_domain',
	}),
}));

export const c15t_consentPolicy = sqliteTable('c15t_consentPolicy', {
	id: text('id', { length: 255 }).primaryKey().notNull(),
	version: text('version').notNull(),
	type: text('type').notNull(),
	hash: text('hash'),
	effectiveDate: integer('effectiveDate', { mode: 'timestamp' }).notNull(),
	isActive: integer('isActive', { mode: 'boolean' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
	tenantId: text('tenantId'),
});

export const c15t_consentPolicyRelations = relations(
	c15t_consentPolicy,
	({ one, many }) => ({
		consents: many(c15t_consent, {
			relationName: 'consent_consentPolicy',
		}),
	}),
);

export const c15t_runtimePolicyDecision = sqliteTable(
	'c15t_runtimePolicyDecision',
	{
		id: text('id', { length: 255 }).primaryKey().notNull(),
		tenantId: text('tenantId'),
		policyId: text('policyId').notNull(),
		fingerprint: text('fingerprint').notNull(),
		matchedBy: text('matchedBy').notNull(),
		countryCode: text('countryCode'),
		regionCode: text('regionCode'),
		jurisdiction: text('jurisdiction').notNull(),
		language: text('language'),
		model: text('model').notNull(),
		policyI18n: blob('policyI18n', { mode: 'json' }),
		uiMode: text('uiMode'),
		bannerUi: blob('bannerUi', { mode: 'json' }),
		dialogUi: blob('dialogUi', { mode: 'json' }),
		categories: blob('categories', { mode: 'json' }),
		preselectedCategories: blob('preselectedCategories', { mode: 'json' }),
		proofConfig: blob('proofConfig', { mode: 'json' }),
		dedupeKey: text('dedupeKey').unique().notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.notNull()
			.defaultNow(),
	},
);

export const c15t_runtimePolicyDecisionRelations = relations(
	c15t_runtimePolicyDecision,
	({ one, many }) => ({
		consents: many(c15t_consent, {
			relationName: 'consent_runtimePolicyDecision',
		}),
	}),
);

export const c15t_consentPurpose = sqliteTable('c15t_consentPurpose', {
	id: text('id', { length: 255 }).primaryKey().notNull(),
	code: text('code').notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().defaultNow(),
	tenantId: text('tenantId'),
});

export const c15t_consent = sqliteTable(
	'c15t_consent',
	{
		id: text('id', { length: 255 }).primaryKey().notNull(),
		subjectId: text('subjectId').notNull(),
		domainId: text('domainId').notNull(),
		policyId: text('policyId'),
		purposeIds: blob('purposeIds', { mode: 'json' }).notNull(),
		metadata: blob('metadata', { mode: 'json' }),
		ipAddress: text('ipAddress'),
		userAgent: text('userAgent'),
		givenAt: integer('givenAt', { mode: 'timestamp' }).notNull().defaultNow(),
		validUntil: integer('validUntil', { mode: 'timestamp' }),
		jurisdiction: text('jurisdiction'),
		jurisdictionModel: text('jurisdictionModel'),
		tcString: text('tcString'),
		uiSource: text('uiSource'),
		consentAction: text('consentAction'),
		runtimePolicyDecisionId: text('runtimePolicyDecisionId'),
		runtimePolicySource: text('runtimePolicySource'),
		tenantId: text('tenantId'),
	},
	table => [
		foreignKey({
			columns: [table.subjectId],
			foreignColumns: [c15t_subject.id],
			name: 'consent_subject_subject_fk',
		})
			.onUpdate('restrict')
			.onDelete('restrict'),
		foreignKey({
			columns: [table.domainId],
			foreignColumns: [c15t_domain.id],
			name: 'consent_domain_domain_fk',
		})
			.onUpdate('restrict')
			.onDelete('restrict'),
		foreignKey({
			columns: [table.policyId],
			foreignColumns: [c15t_consentPolicy.id],
			name: 'consent_consentPolicy_policy_fk',
		})
			.onUpdate('restrict')
			.onDelete('restrict'),
		foreignKey({
			columns: [table.runtimePolicyDecisionId],
			foreignColumns: [c15t_runtimePolicyDecision.id],
			name: 'consent_runtimePolicyDecision_runtimePolicyDecision_fk',
		})
			.onUpdate('restrict')
			.onDelete('restrict'),
	],
);

export const c15t_consentRelations = relations(
	c15t_consent,
	({ one, many }) => ({
		subject: one(c15t_subject, {
			relationName: 'consent_subject',
			fields: [c15t_consent.subjectId],
			references: [c15t_subject.id],
		}),
		domain: one(c15t_domain, {
			relationName: 'consent_domain',
			fields: [c15t_consent.domainId],
			references: [c15t_domain.id],
		}),
		policy: one(c15t_consentPolicy, {
			relationName: 'consent_consentPolicy',
			fields: [c15t_consent.policyId],
			references: [c15t_consentPolicy.id],
		}),
		runtimePolicyDecision: one(c15t_runtimePolicyDecision, {
			relationName: 'consent_runtimePolicyDecision',
			fields: [c15t_consent.runtimePolicyDecisionId],
			references: [c15t_runtimePolicyDecision.id],
		}),
	}),
);

export const c15t_auditLog = sqliteTable(
	'c15t_auditLog',
	{
		id: text('id', { length: 255 }).primaryKey().notNull(),
		entityType: text('entityType').notNull(),
		entityId: text('entityId').notNull(),
		actionType: text('actionType').notNull(),
		subjectId: text('subjectId'),
		ipAddress: text('ipAddress'),
		userAgent: text('userAgent'),
		changes: blob('changes', { mode: 'json' }),
		metadata: blob('metadata', { mode: 'json' }),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.notNull()
			.defaultNow(),
		tenantId: text('tenantId'),
	},
	table => [
		foreignKey({
			columns: [table.subjectId],
			foreignColumns: [c15t_subject.id],
			name: 'auditLog_subject_subject_fk',
		})
			.onUpdate('restrict')
			.onDelete('restrict'),
	],
);

export const c15t_auditLogRelations = relations(
	c15t_auditLog,
	({ one, many }) => ({
		subject: one(c15t_subject, {
			relationName: 'auditLog_subject',
			fields: [c15t_auditLog.subjectId],
			references: [c15t_subject.id],
		}),
	}),
);

export const private_c15t_settings = sqliteTable('private_c15t_settings', {
	id: text('id', { length: 255 }).primaryKey().notNull(),
	version: text('version', { length: 255 }).notNull().default('2.0.0'),
});
