# Legal documents and signed releases

EdgeCMS manages legal content separately from ordinary content publishing. The
page at `/edge-cms/legal` stores one Markdown draft per configured locale and
groups those drafts under a legal document record. The editor accepts typed or
pasted Markdown and `.md` file imports, then saves changes after the writer
pauses. When an instance has no languages yet, the first legal document starts
with English as the primary language.

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

The admin publish action uses its UTC publication date (`YYYY-MM-DD`) for both
`version` and `effectiveDate`, so editors never manage a separate version
number. A release moves from `processing` to `active` after its signed PDFs are
ready. The previously active release becomes `retired` in the same database
batch. Failed workflow runs can be retried or discarded with any partial PDF
artifacts they created. More than one immutable release can share a publication
date; `releaseHash` identifies the exact signed content.

The current aliases expose the active release:

- `/edge-cms/public/legal/:slug/:locale` returns the parsed payload, its exact
  `canonicalPayload` string, hash, base64url ES256 signature, key ID, public
  JWK, and immutable evidence, Markdown, and PDF URLs.
- `/edge-cms/public/legal/:slug/:locale.md` returns the active raw Markdown as
  `text/markdown`.
- `/edge-cms/public/legal/:slug/:locale.pdf` streams its PDF rendition.

Every signed release remains available at immutable URLs after it is retired:

- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash`
- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash.md`
- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash.pdf`

Generated PDFs point to their hash-specific evidence URL, and the immutable
responses use long-lived immutable caching. The current aliases use short-lived
caching because a later publication can replace their content.

The key endpoint covers all published release history:

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

Legal PDFs are rendered from sanitized HTML with `@cloudflare/puppeteer`.
Standard local Wrangler development launches a local headless browser.

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
