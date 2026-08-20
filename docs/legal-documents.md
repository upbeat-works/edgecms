# Legal documents and signed releases

EdgeCMS manages legal content separately from ordinary content publishing. The
page at `/edge-cms/legal` stores one Markdown draft per configured locale and
groups those drafts under a legal document record. The editor accepts typed or
pasted Markdown and `.md` file imports, then saves changes after the writer
pauses. When an instance has no languages yet, the first legal document starts
with English as the primary language.

API-key clients can create and replace drafts from Markdown files:

```bash
edgecms legal:create ./privacy.en.md \
  --name "Privacy Policy" \
  --type privacy_policy \
  --locale en
edgecms legal:update 42 ./privacy.es.md --locale es
```

The locale must already exist. These commands preserve the file contents and
only change mutable drafts. Legal publication, signing, PDF generation, and
release activation are available only from the legal document admin UI. The
general `edgecms publish` command publishes the shared content draft; it does
not publish legal documents.

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
  JWK, immutable evidence URLs, and a short-lived c15t consent capability.
- `/edge-cms/public/legal/:slug/:locale.md` returns the active raw Markdown as
  `text/markdown`.
- `/edge-cms/public/legal/:slug/:locale.pdf` streams its PDF rendition.

Every signed release remains available at immutable URLs after it is retired:

- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash`
- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash.md`
- `/edge-cms/public/legal/:slug/:locale/releases/:releaseHash.pdf`

Generated PDFs point to their hash-specific evidence URL, and the immutable
responses use long-lived immutable caching. The current Markdown and PDF aliases
use short-lived caching because a later publication can replace their content.
The current JSON alias uses `private, no-store` because its consent capability
expires after 15 minutes. Hash-specific JSON omits that capability and remains
immutable.

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

The EdgeCMS app requires `LEGAL_SIGNING_PRIVATE_JWK` to build and run, including
when the current work only edits drafts. Draft endpoints do not sign content,
but that does not make the instance secret optional. The private JWK is used
when an editor publishes from the admin UI. The publication workflow derives the
public JWK, stores it with the key ID on each signed variant, and never exposes
the private `d` value through a public endpoint.

## Consent integration

EdgeCMS runs c15t at `/edge-cms/consent` and stores its append-only consent
receipts in the instance D1 database. Migration `0023_add_c15t_consent.sql`
creates the prefixed c15t tables. Activating a legal release registers one c15t
policy for the document, covering every signed locale variant in that release.
The prefixed policy table is part of c15t's schema, not an EdgeCMS projection
table. EdgeCMS remains authoritative for authored content, signed variants,
PDFs, and release lifecycle. c15t owns the policy index required by its status
queries and is authoritative for consent receipts.

c15t exposes an authenticated `/legal-documents/:type/current` endpoint, but its
policy replacement uses an adapter transaction. D1 guarantees atomic
multi-statement writes through `DB.batch()`, while the c15t Drizzle transaction
callback cannot currently provide that boundary on D1. EdgeCMS therefore keeps
c15t's official policy identity, schema, and replacement semantics inside the
same D1 batch as the release transition. Do not replace this bridge with the
official endpoint until c15t provides an atomic D1 transaction path.

Fetch the current document immediately before showing it. Its `consent` value
contains a 15-minute snapshot token bound to the release policy and the exact
locale-specific document hash, type, version, and effective date:

```typescript
const cmsUrl = 'https://cms.example.com';
const document = await fetch(`${cmsUrl}/edge-cms/public/legal/privacy/en`).then(
	response => response.json(),
);

const receipt = await fetch(new URL(document.consent.endpoint, cmsUrl), {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		type: document.consent.type,
		subjectId: 'sub_2jv6z8n4q9',
		domain: location.hostname,
		documentSnapshotToken: document.consent.documentSnapshotToken,
		metadata: { flow: 'signup' },
	}),
}).then(response => {
	if (!response.ok) throw new Error('Could not record legal consent');
	return response.json();
});
```

Use a stable, pseudonymous `subjectId`. The public endpoint ignores account-link
fields and records server receipt time as `givenAt`. Use authenticated RPC when
an account link or explicit event time is required. Add the frontend origin to
`TRUSTED_ORIGINS`; c15t handles its CORS preflight. A valid receipt includes
`subjectId`, `consentId`, `domainId`, `domain`, `type`, and `givenAt`.

Read the subject's current status with the c15t API:

```text
GET /edge-cms/consent/subjects/:subjectId?type=:consentType
```

The response reports whether the receipt remains valid and includes the recorded
`policyHash`. EdgeCMS derives that hash from the release and all its localized
document hashes. The receipt metadata identifies the exact locale and document
hash the user accepted. EdgeCMS exposes only c15t health, per-subject status,
and signed legal acceptance; it does not expose subject listings or external
account identifiers. Consent request bodies are capped at 64 KiB. Public writes
are limited to 60 requests per minute for each Cloudflare connecting IP. c15t
does not require `consentAction` for legal documents, so EdgeCMS does not send
one and c15t leaves the derived receipt action empty. The SDK payload is
allowlisted, so callers cannot set c15t preference, action, jurisdiction, TCF,
UI-source, policy, account-link, or receipt-time fields.

The SDK exposes the same public flow without requiring an API key:

```typescript
import { EdgeCMSClient } from '@upbeat-works/edgecms-sdk';

const edgecms = new EdgeCMSClient({
	baseUrl: 'https://cms.example.com/edge-cms',
});
const document = await edgecms.getLegalDocument('privacy', 'en');
const receipt = await edgecms.recordLegalConsent({
	type: document.consent.type,
	documentSnapshotToken: document.consent.documentSnapshotToken,
	subjectId: 'sub_2jv6z8n4q9',
	domain: location.hostname,
	metadata: { flow: 'signup' },
});
const status = await edgecms.getLegalConsentStatus(receipt.subjectId, {
	type: document.consent.type,
});
```

Pass the capability returned with the rendered document to `recordLegalConsent`;
do not fetch another release after the user accepts. The management SDK methods
still require `apiKey` in the client configuration.

Workers in the same Cloudflare account can use the `EdgeCMSService` binding. The
RPC write uses the same signed capability as the frontend API, so the receipt is
bound to the document the user saw. The calling Worker must forward the client
request evidence; EdgeCMS passes it through c15t's normal proof collection:

```typescript
const document = await env.EDGECMS.getLegalDocument('privacy', 'en');
const ipAddress = request.headers.get('CF-Connecting-IP');
const userAgent = request.headers.get('User-Agent');
if (!ipAddress || !userAgent) throw new Error('Missing request evidence');
const receipt = await env.EDGECMS.recordLegalConsent({
	type: document.consent.type,
	documentSnapshotToken: document.consent.documentSnapshotToken,
	subjectId: 'sub_2jv6z8n4q9',
	domain: 'client.example',
	ipAddress,
	userAgent,
	uiSource: 'signup',
	metadata: { flow: 'signup' },
});
await env.EDGECMS.identifyLegalConsentSubject({
	subjectId: receipt.subjectId,
	externalId: 'user_42',
	identityProvider: 'my-worker',
	ipAddress,
	userAgent,
});
```

`identifyLegalConsentSubject` uses c15t's subject PATCH flow. It updates the
official subject row and appends c15t's `identify_user` audit entry.

The c15t snapshot signing key is derived from `LEGAL_SIGNING_PRIVATE_JWK` with a
separate purpose label. No extra production secret is required.
