# Custom routes and extensions

## Contents

- [Extension composition root](#extension-composition-root)
- [Route module pattern](#route-module-pattern)
- [Authentication and validation](#authentication-and-validation)
- [Data, bindings, and secrets](#data-bindings-and-secrets)
- [Upgrade boundary](#upgrade-boundary)
- [Verification](#verification)

Use the extension API for project-specific authenticated tools that belong
inside the EdgeCMS admin shell. For example, an extension can add an operations
screen, record-mapping mutations, and a synchronization flow without modifying
the built-in route list for each feature.

## Extension composition root

Declare routes and navigation in `app/extension.ts` using the deployment's
`Extension` type:

```ts
import { route } from '@react-router/dev/routes'
import type { Extension } from './extension.types'

const extension: Extension = {
  routes: [
    route('operations', 'routes/custom/operations/route.tsx'),
    route('record-mapping', 'routes/custom/operations/record-mapping.action.ts'),
    route('sync-records', 'routes/custom/operations/sync-records.tsx'),
  ],
  navItems: [{ href: '/edge-cms/custom/operations', label: 'Operations' }],
}

export default extension
```

Paths in `extension.routes` are relative to `/edge-cms/custom/`. Route module
paths are relative to `app/`. Navigation hrefs are absolute browser paths. Add
only user-facing destinations to `navItems`; action/resource routes do not need
navigation entries.

The EdgeCMS route configuration mounts `extension.routes` beneath its custom
prefix inside the authenticated admin layout. Its navigation module appends
`extension.navItems` after built-in items. Keep `extension.ts` declarative and
move feature behavior into `app/routes/custom/<feature>/`.

## Route module pattern

Use ordinary React Router route modules:

- Put the screen and its data-loading `loader` in a page route.
- Use separate action/resource routes when a mutation or preview operation has
  a distinct responsibility.
- Keep external API and database operations in `.server.ts` modules.
- Keep parsing and transformation logic in small cohesive modules that can be
  unit tested without the router or network.
- Use generated route types from each route module's `+types` output.

For example, an operations page can load source records, destination records,
and D1 mappings concurrently. Its dialogs can call dedicated `record-mapping`
and `sync-records` routes. The synchronization route can separate preview
(`loader`) from execution (`action`), validate a bounded date range in both
paths, identify already-existing records, and submit only explicitly selected
records.

## Authentication and validation

Call `requireAuth` at the start of every custom loader and action. Being mounted
inside the authenticated visual layout does not remove the need to protect a
route module's server entry points directly.

For mutation/resource routes:

- Restrict accepted HTTP methods and return `405` otherwise.
- Parse and validate form fields, enums, IDs, dates, and maximum ranges at the
  boundary.
- Return deliberate `400` responses for invalid input and bounded upstream
  failures rather than leaking credentials or full provider responses.
- Make destructive or external-write operations explicit in the UI; use a
  preview/confirmation step when impact is meaningful.
- Preserve idempotency where possible. Detect existing records before bulk
  creation and report created and skipped counts.

Authentication proves identity, not authorization. The current extension API
does not provide role-gated nav items. Add server-side authorization checks in
the route when a tool is not appropriate for every signed-in EdgeCMS user.

## Data, bindings, and secrets

Custom routes execute in the EdgeCMS Worker and may use its D1 database,
Cloudflare bindings, environment variables, and secrets. Add required bindings
to `wrangler.jsonc`, keep sensitive provider keys as Worker secrets, regenerate
Worker types, and verify every environment used for preview/staging/production.

When adding persistent data, define a migration and test behavior through the
database/service boundary. Do not overload core EdgeCMS content tables for
unrelated extension state. Store extension mappings in a dedicated table with
uniqueness constraints and use server modules for D1 and third-party APIs.
Before creating or merging migrations, follow
[migrations.md](migrations.md).

## Upgrade boundary

Keep instance extensions confined to `app/extension.ts`, custom route folders,
feature utilities/schema, migrations, and deployment configuration. This makes
upstream EdgeCMS upgrades easier to merge and audit.

The minimal extension API currently supports only `routes` and `navItems`. Do
not assume component overrides, layout slots, nav icons, per-item role rules,
settings injection, external extension packages, or routes outside
`/edge-cms/custom/*`. Inspect `app/extension.types.ts` in the target instance
because upstream may evolve this contract.

## Verification

Test pure parsing/transformation logic separately and cover route behavior at
the public loader/action boundary: unauthenticated requests, invalid input,
successful reads, external failures, and mutations that matter. Mock only
unavoidable providers. Then run type generation, typecheck, tests, build, and a
local authenticated smoke test of navigation and each custom endpoint.
