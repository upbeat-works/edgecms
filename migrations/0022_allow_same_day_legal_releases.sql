PRAGMA defer_foreign_keys = ON;

CREATE TABLE legal_releases_rebuilt (
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
  createdBy TEXT REFERENCES user(id) ON DELETE SET NULL
);

INSERT INTO legal_releases_rebuilt (
  id,
  documentId,
  version,
  effectiveDate,
  status,
  workflowId,
  failureReason,
  createdAt,
  publishedAt,
  activatedAt,
  retiredAt,
  createdBy
)
SELECT
  id,
  documentId,
  version,
  effectiveDate,
  status,
  workflowId,
  failureReason,
  createdAt,
  publishedAt,
  activatedAt,
  retiredAt,
  createdBy
FROM legal_releases;

CREATE TABLE legal_release_variants_backup (
  id INTEGER NOT NULL,
  releaseId INTEGER NOT NULL,
  locale TEXT NOT NULL,
  payload TEXT NOT NULL,
  releaseHash TEXT,
  signature TEXT,
  signingKeyId TEXT,
  publicJwk TEXT,
  pdfKey TEXT
);

INSERT INTO legal_release_variants_backup (
  id,
  releaseId,
  locale,
  payload,
  releaseHash,
  signature,
  signingKeyId,
  publicJwk,
  pdfKey
)
SELECT
  id,
  releaseId,
  locale,
  payload,
  releaseHash,
  signature,
  signingKeyId,
  publicJwk,
  pdfKey
FROM legal_release_variants;

DROP TABLE legal_release_variants;
DROP TABLE legal_releases;

ALTER TABLE legal_releases_rebuilt RENAME TO legal_releases;

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

INSERT INTO legal_release_variants (
  id,
  releaseId,
  locale,
  payload,
  releaseHash,
  signature,
  signingKeyId,
  publicJwk,
  pdfKey
)
SELECT
  id,
  releaseId,
  locale,
  payload,
  releaseHash,
  signature,
  signingKeyId,
  publicJwk,
  pdfKey
FROM legal_release_variants_backup;

DROP TABLE legal_release_variants_backup;

CREATE INDEX idx_legal_releases_document_status
  ON legal_releases(documentId, status);

CREATE UNIQUE INDEX idx_legal_release_variants_hash
  ON legal_release_variants(releaseHash)
  WHERE releaseHash IS NOT NULL;

PRAGMA defer_foreign_keys = OFF;
