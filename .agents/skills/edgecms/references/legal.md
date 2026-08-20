# Legal documents and signing

## Edit drafts from the CLI

Create the locale before writing a legal draft. Create a document with its first
Markdown draft:

```bash
edgecms legal:create ./privacy.en.md \
  --name "Privacy Policy" \
  --type privacy_policy \
  --locale en
```

Supported types are `terms_and_conditions`, `privacy_policy`, `cookie_policy`,
`dpa`, and `other`. Omit `--slug` to derive it from the name. Omit `--locale` to
use `defaultLocale`.

Replace one locale's mutable draft by document ID:

```bash
edgecms legal:update 42 ./privacy.es.md --locale es
```

Both commands preserve the file contents exactly. They require an API key and
change only drafts. They do not sign, render a PDF, start a release, or make the
document public. Publish legal documents only from `/edge-cms/legal`. The
general `edgecms publish` command publishes the shared content draft, not legal
documents.

## Configure the signing key

Generate an EC P-256 private JWK from the EdgeCMS instance repository:

```bash
npm run legal:keygen
```

`LEGAL_SIGNING_PRIVATE_JWK` is required for the EdgeCMS instance to build and
run, even when the immediate work only edits drafts. Store its compact JSON in
local `.dev.vars`. In production, store it as a Worker secret rather than a
Wrangler variable or committed file:

```bash
node scripts/generate-legal-signing-key.mjs | npx wrangler secret put LEGAL_SIGNING_PRIVATE_JWK
```

Set `LEGAL_SIGNING_KEY_ID` as a non-secret Wrangler variable. It identifies the
key material used for a release. When rotating, change the private JWK and key
ID together, never reuse an ID for different key material, and retain the old
private key offline for the required legal retention period.

The draft endpoints do not sign content, but the instance secret is not
optional. During UI publication, EdgeCMS freezes each non-empty locale as a JSON
payload, hashes the exact UTF-8 bytes with SHA-256, and signs the same bytes
with ES256. It stores the lowercase hash, base64url signature, key ID, and
derived public JWK with the immutable release. The public JWK contains `x` and
`y` for verification; the private `d` value is never published. The PDF displays
the payload hash and is a rendition, not a second source of truth.

Legal consent submissions use c15t's optional legal-document action model and
do not set `consentAction`. Policy activation remains an atomic D1 batch because
c15t's `/legal-documents/:type/current` transaction callback is not atomic under
the D1 Drizzle bridge. Keep the official c15t schema, policy identity, and
replacement semantics in that batch until c15t provides an atomic D1 path.
