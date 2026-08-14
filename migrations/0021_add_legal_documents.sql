CREATE TABLE legal_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('terms_and_conditions', 'privacy_policy', 'cookie_policy', 'dpa', 'other')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy TEXT REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE legal_document_drafts (
  documentId INTEGER NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  locale TEXT NOT NULL REFERENCES languages(locale) ON DELETE CASCADE ON UPDATE CASCADE,
  markdown TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  PRIMARY KEY (documentId, locale)
);

CREATE TABLE legal_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documentId INTEGER NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  effectiveDate TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'failed', 'published', 'active', 'retired')),
  workflowId TEXT,
  failureReason TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publishedAt TEXT,
  activatedAt TEXT,
  retiredAt TEXT,
  createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE (documentId, version)
);

CREATE INDEX idx_legal_releases_document_status
  ON legal_releases(documentId, status);

CREATE TABLE legal_release_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  releaseId INTEGER NOT NULL REFERENCES legal_releases(id) ON DELETE CASCADE,
  locale TEXT NOT NULL REFERENCES languages(locale) ON DELETE RESTRICT ON UPDATE CASCADE,
  payload TEXT NOT NULL,
  releaseHash TEXT,
  signature TEXT,
  signingKeyId TEXT,
  publicJwk TEXT,
  pdfKey TEXT,
  UNIQUE (releaseId, locale)
);

CREATE UNIQUE INDEX idx_legal_release_variants_hash
  ON legal_release_variants(releaseHash)
  WHERE releaseHash IS NOT NULL;
