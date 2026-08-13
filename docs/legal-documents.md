# Legal documents and signed releases

EdgeCMS manages legal content separately from ordinary content publishing. The
page at `/edge-cms/legal` stores one Markdown draft per configured locale and
groups those drafts under a legal document record.

## Release evidence

Publishing creates an immutable locale variant from this exact JSON field order:

1. `documentId`
2. `slug`
3. `type`
4. `locale`
5. `version`
6. `effectiveDate`
7. `markdown`

EdgeCMS hashes the UTF-8 bytes of that stored JSON with SHA-256. The lowercase
hex digest is the sole `releaseHash`. It then signs the same bytes with the
configured P-256 private key using ES256. The generated PDF is a rendition of
the signed Markdown and displays the `releaseHash`; it does not introduce a
second content hash.

A release moves through `processing`, `published`, `active`, and `retired`.
Failed workflow runs can be retried. Publication never activates a release:
activation is an explicit action, and at most one release per document is
active. Effective date is signed metadata and does not schedule activation.

The public endpoints expose only active content:

- `/edge-cms/public/legal/:slug/:locale` returns the parsed payload, its exact
  `canonicalPayload` string, hash, base64url ES256 signature, key ID, public
  JWK, and PDF URL.
- `/edge-cms/public/legal/:slug/:locale.pdf` streams its PDF rendition.
- `/edge-cms/public/legal/keys.json` returns the public keys used by published,
  active, and retired release history.

Locale lookup is exact and never falls back. Once a document has release
history, its signed identity (`slug` and `type`) is locked. Its display name and
working Markdown drafts can still change.

## Signing key setup

Generate an EC P-256 private JWK:

```bash
npm run legal:keygen
```

Put its compact JSON output in local `.dev.vars`:

```env
LEGAL_SIGNING_PRIVATE_JWK={"kty":"EC","x":"...","y":"...","crv":"P-256","d":"...","alg":"ES256","key_ops":["sign"],"ext":true}
```

Store production keys as a Worker secret:

```bash
node scripts/generate-legal-signing-key.mjs | npx wrangler secret put LEGAL_SIGNING_PRIVATE_JWK
```

Browser Run Quick Actions do not execute in fully local Wrangler mode. Use
`npx wrangler dev --remote` when manually testing legal PDF publication.

`LEGAL_SIGNING_KEY_ID` is a non-secret Wrangler variable that identifies the
key. Change the secret and key ID together when rotating. Old public keys remain
available from release history, so previously captured evidence remains
verifiable. Never reuse a key ID for different key material, and retain an
offline backup of private keys for the retention period your legal process
requires.

## Consent integration

Use `releaseHash` as the legal document version recorded by a consent provider
such as c15t. Keep the consent tables in the existing D1 database under a
dedicated prefix or schema convention. EdgeCMS does not install c15t or own
consent receipts in this release; the public evidence endpoint is the boundary
an integration can consume.
