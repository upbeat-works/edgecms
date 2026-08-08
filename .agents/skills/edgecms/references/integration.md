# Application integration

## Public HTTP

Published translations are available beneath
`/edge-cms/public/i18n/{locale}.json`, blocks beneath
`/edge-cms/public/blocks/{collection}`, and media beneath
`/edge-cms/public/media/{filename}`. Public reads expose live content, not the
draft. Confirm the exact deployed base URL and response shape in the current
EdgeCMS version.

Applications may bundle pulled locale snapshots, then overlay published CMS
content at runtime. This supports synchronous i18n initialization, SSR/client
consistency, and a fallback if EdgeCMS is unavailable. Preserve project-defined
caching and error behavior.

Block collections may intentionally have no bundled fallback. Test their
failure behavior at the application boundary.

## Cloudflare service bindings

Workers in the same Cloudflare account can bind to the `EdgeCMSService`
entrypoint, avoiding HTTP, DNS/TLS overhead, and API keys at runtime:

```jsonc
{
  "binding": "EDGECMS",
  "service": "edgecms",
  "entrypoint": "EdgeCMSService"
}
```

Live read methods include translations, blocks, media, and languages. The RPC
surface also supports draft inspection, language/schema/collection changes,
key deletion, publication, and publish-status checks. RPC failures throw and
use `error.name` for the same machine-readable codes returned by REST.

Service-binding reads of translations use the published snapshot. Blocks use
the published snapshot when one exists; before the first publication they may
fall back to database state. Once a live version exists, do not leak a newly
created draft-only collection through fallback behavior.

Generate or maintain a consumer-side declaration for the RPC entrypoint when
Cloudflare type generation cannot infer types across repositories.

## Media

Media is stored and served by filename; uploads are sanitized to kebab-case.
When proxying media through an application, preserve content type, streaming
body, cache validators, query parameters, and error responses. Avoid prefixing
URLs that are already absolute EdgeCMS media URLs.

## Admin extensions

An EdgeCMS deployment may define project-specific admin routes and navigation
through `app/extension.ts`. Read [custom-routes.md](custom-routes.md) before
adding or changing an extension.
