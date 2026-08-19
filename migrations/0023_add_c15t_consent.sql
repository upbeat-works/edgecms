CREATE TABLE c15t_subject (
  id TEXT PRIMARY KEY NOT NULL,
  externalId TEXT,
  identityProvider TEXT,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  tenantId TEXT
);

CREATE TABLE c15t_domain (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  tenantId TEXT
);

CREATE TABLE c15t_consentPolicy (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  hash TEXT,
  effectiveDate INTEGER NOT NULL,
  isActive INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  tenantId TEXT
);

CREATE TABLE c15t_runtimePolicyDecision (
  id TEXT PRIMARY KEY NOT NULL,
  tenantId TEXT,
  policyId TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  matchedBy TEXT NOT NULL,
  countryCode TEXT,
  regionCode TEXT,
  jurisdiction TEXT NOT NULL,
  language TEXT,
  model TEXT NOT NULL,
  policyI18n BLOB,
  uiMode TEXT,
  bannerUi BLOB,
  dialogUi BLOB,
  categories BLOB,
  preselectedCategories BLOB,
  proofConfig BLOB,
  dedupeKey TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE c15t_consentPurpose (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  tenantId TEXT
);

CREATE TABLE c15t_consent (
  id TEXT PRIMARY KEY NOT NULL,
  subjectId TEXT NOT NULL,
  domainId TEXT NOT NULL,
  policyId TEXT,
  purposeIds BLOB NOT NULL,
  metadata BLOB,
  ipAddress TEXT,
  userAgent TEXT,
  givenAt INTEGER NOT NULL DEFAULT (unixepoch()),
  validUntil INTEGER,
  jurisdiction TEXT,
  jurisdictionModel TEXT,
  tcString TEXT,
  uiSource TEXT,
  consentAction TEXT,
  runtimePolicyDecisionId TEXT,
  runtimePolicySource TEXT,
  tenantId TEXT,
  CONSTRAINT consent_subject_subject_fk
    FOREIGN KEY (subjectId) REFERENCES c15t_subject(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT consent_domain_domain_fk
    FOREIGN KEY (domainId) REFERENCES c15t_domain(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT consent_consentPolicy_policy_fk
    FOREIGN KEY (policyId) REFERENCES c15t_consentPolicy(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT consent_runtimePolicyDecision_runtimePolicyDecision_fk
    FOREIGN KEY (runtimePolicyDecisionId) REFERENCES c15t_runtimePolicyDecision(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE c15t_auditLog (
  id TEXT PRIMARY KEY NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  actionType TEXT NOT NULL,
  subjectId TEXT,
  ipAddress TEXT,
  userAgent TEXT,
  changes BLOB,
  metadata BLOB,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  tenantId TEXT,
  CONSTRAINT auditLog_subject_subject_fk
    FOREIGN KEY (subjectId) REFERENCES c15t_subject(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE private_c15t_settings (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL DEFAULT '2.0.0'
);
