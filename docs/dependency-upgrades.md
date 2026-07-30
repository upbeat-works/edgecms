# Dependency upgrades (shared stack)

Companion to [react-router-v8-migration.md](./react-router-v8-migration.md).
That doc covers the framework move; this one covers the other shared-stack
dependencies — better-auth, drizzle-orm, and zod — plus the TypeScript cleanups
that fell out of them.

Executed on EdgeCMS 2026-07-30. Result: **19 → 8 audit vulnerabilities, zero
high or critical remaining**, and **39 → 0 typecheck errors**.

## Order matters

Do the dependency bumps **before** fixing type errors. Several EdgeCMS type
errors were symptoms of the old versions, not real defects — three `Date`
assignability errors disappeared on the better-auth bump alone, and others only
became visible once real types resolved. Fixing them first would have meant
writing workarounds for problems the upgrade deletes.

Expect the error count to move around rather than fall monotonically. On EdgeCMS
it went 39 → 39 → 42 → 36 → 32 → 19 → 11 → 10 → 9 → 1 → 0. The rise to 42 was
progress: broken imports had been masking downstream errors.

## drizzle-orm 0.44 → 0.45.2

Fixes [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9)
(high, SQL injection). npm labels it a breaking change; the substance is a fix
to identifier escaping:

> Fixed `sql.identifier()`, `sql.as()` escaping issues. Previously all the
> values passed to these functions were not properly escaped causing a possible
> SQL Injection (CWE-89) vulnerability.

**Check exposure before assuming it's safe:**

```sh
grep -rn "sql\.identifier\|sql\.as(" --include='*.ts' --include='*.tsx' app/ workers/
```

EdgeCMS uses neither, so the bump was a no-op requiring zero code changes. An
app that _does_ use them should re-check any query building around user input —
the escaping behavior changes, which is the point.

```sh
npm install drizzle-orm@^0.45.2
```

`drizzle-kit` needs no change; 0.31.x is already current.

## better-auth 1.3 → 1.6 — the involved one

This clears **13 advisories**, several critical (unauthenticated API key
creation, OAuth state/PKCE issues, account takeover via pre-account hijacking,
2FA bypass via `session.cookieCache`). It is also the only upgrade here that
needs a **database migration**.

Note that `better-auth` is often pinned to an _exact_ version in `package.json`
(EdgeCMS had `"better-auth": "1.3.10"`). That pin is why the app drifted so far
behind — a caret range would have picked these up. Consider whether the pin is
deliberate before restoring it.

### 1. Install, including the extracted plugin

1.5 moved the api-key plugin into its own package:

```sh
npm install better-auth@^1.6.25 @better-auth/api-key@latest
```

```diff
-import { admin, apiKey } from 'better-auth/plugins';
+import { admin } from 'better-auth/plugins';
+import { apiKey } from '@better-auth/api-key';
```

Only `apiKey` moved — `admin` and the other plugins stay on
`better-auth/plugins`.

### 2. Database migration (required)

The `apikey` table changed in 1.5:

- `userId` → **`referenceId`**, because a key may now be owned by a user _or_ an
  organization, selected by the plugin's `references` option. If you don't set
  `references` (we don't), it remains a user id.
- new required **`configId`** column, default `'default'`, selecting between
  multiple api-key configurations. Indexed by the plugin.

SQLite/D1 supports `RENAME COLUMN`, so no table rebuild is needed:

```sql
ALTER TABLE apikey RENAME COLUMN userId TO referenceId;
ALTER TABLE apikey ADD COLUMN configId TEXT NOT NULL DEFAULT 'default';

-- SQLite keeps the old index name after RENAME COLUMN; replace it so the name
-- matches the column it covers.
DROP INDEX IF EXISTS idx_apikey_userId;
CREATE INDEX IF NOT EXISTS idx_apikey_referenceId ON apikey(referenceId);
CREATE INDEX IF NOT EXISTS idx_apikey_configId ON apikey(configId);
```

See `migrations/0019_better_auth_apikey_reference_id.sql`. Apply and verify:

```sh
npm run db:migrations:local
npx wrangler d1 execute DB --local --command \
  "SELECT name FROM pragma_table_info('apikey') WHERE name IN ('userId','referenceId','configId');"
```

**Deploying needs the remote migration too** — `npm run db:migrations` (the
`--remote` variant, which `npm run deploy` already runs). Until that lands,
api-key auth breaks in production, because the code reads a column that isn't
there yet. Sequence the deploy accordingly.

Mirror the change in the drizzle schema (`app/utils/schema.server.ts`):

```diff
-	userId: text('userId')
+	referenceId: text('referenceId')
 		.notNull()
 		.references(() => user.id, { onDelete: 'cascade' }),
+	configId: text('configId').notNull().default('default'),
```

### 3. Code changes

**`verifyApiKey` result field.** We keep our own `ApiKeyResult` boundary type
with a `userId` field and map it, so callers
(`createVersion(description, userId)`) stay honest — the value _is_ a user id
given our config:

```diff
-			userId: result.key.userId,
+			// better-auth >=1.5 renamed this to `referenceId` to allow org-owned
+			// keys. We don't configure `references`, so it is always a user id.
+			userId: result.key.referenceId,
```

**`listApiKeys` return shape.** Now paginated instead of a bare array:

```diff
-const apiKeys = result.map(key => ({ ... }));
+const apiKeys = result.apiKeys.map(key => ({ ... }));
```

It returns `{ apiKeys, total, limit, offset }`.

**`User` is no longer exported from `better-auth/api`.** Prefer inferring from
the API response over importing the type:

```diff
-import { APIError, type User } from 'better-auth/api';
+import { APIError } from 'better-auth/api';
-const currentUser = users.users?.find((u: User) => u.id === userId);
+const currentUser = users.users?.find(u => u.id === userId);
```

**Plugin-added fields need the inferred session type.** `user.role` (from the
admin plugin) does not exist on the base `User` type. Source both types from the
auth instance instead:

```diff
-import { type Session, type User } from 'better-auth';
+// Use better-auth's inferred session so plugin-added fields (e.g. the admin
+// plugin's `user.role`) are present. The base `User`/`Session` types are not
+// plugin-aware.
+type InferredSession = Auth['$Infer']['Session'];
+type Session = InferredSession['session'];
+type User = InferredSession['user'];
```

**`Date` handling.** 1.6 returns real `Date` objects for
`createdAt`/`updatedAt`. Local date formatters typed
`string | number | null | undefined` need widening — the ES2015+ `Date`
constructor already accepts a `Date`:

```diff
-const formatDate = (date: string | number | null | undefined) => {
+const formatDate = (date: string | number | Date | null | undefined) => {
```

Not applicable to EdgeCMS but worth grepping for — removed or renamed in
1.4/1.5: `sendChangeEmailVerification`, `authClient.forgotPassword` (now
`requestPasswordReset`), `POST /account-info` (now `GET`),
`/forget-password/email-otp`, and `better-auth/adapters/test`. Plugin callbacks
that took `request` now take `ctx`.

## zod — must satisfy better-auth's range

After the better-auth bump, this appears:

```
error TS2742: The inferred type of 'createAuth' cannot be named without a
reference to 'better-auth/node_modules/zod/v4/core'. This is likely not portable.
```

Cause: better-auth requires `zod@^4.3.6`. If your root zod is older, npm
installs a **second, nested** copy, and the inferred auth type then references a
non-portable path inside it. Confirm with `npm ls zod` — you'll see both.

Fix by deduping, not by annotating:

```sh
npm install zod@^4.4.3
npm ls zod   # expect a single deduped version
```

This is only surfaced when the auth type gets fully materialized — which the
`Auth['$Infer']['Session']` change above does. Bump zod first on other apps and
you skip the error entirely.

## Type-error patterns worth reusing

Four cleanups from the same session, all likely to recur on sibling apps.

### Tuple returns widen and lose their types

19 of the 39 errors traced to two lines. Returning a mixed-type array literal
from a Workflow step widens to a union:

```diff
-const [defaultLanguage, restLanguages] = await step.do('get languages', cfg,
+const { defaultLanguage, restLanguages } = await step.do('get languages', cfg,
   async () => {
-    let defaultLanguage = null;
-    let restLanguages = [];
+    let defaultLanguage: Language | null = null;
+    const restLanguages: Language[] = [];
     ...
-    return [defaultLanguage, restLanguages];
+    // An array literal of mixed element types widens to
+    // `(Language | Language[])[]`, which loses the types on destructuring.
+    return { defaultLanguage, restLanguages };
   });
```

`let x = []` also infers `any[]`, which is where a run of TS7006 "implicitly has
an 'any' type" errors comes from. Annotate the locals.

### `Serializable<unknown>` rejects `Record<string, unknown>`

Passing data through a Workflow step requires it to satisfy workerd's
`Serializable<T>`, and `unknown` cannot be proven structured-cloneable. The
error is misleading — it reports missing `Date` properties, because `Date` is
the closest member of the `Serializable` union:

```
Type 'Record<string, {...}>' is missing the following properties from type
'Date': toDateString, toTimeString, ... and 37 more.
```

The fix is to stop using `unknown` for data that crosses a serialization
boundary. `app/utils/db/types.ts` now exports `JsonValue` for this.

**Keep that type bounded, not recursive.** A fully recursive JSON type composed
with `Serializable<T>` (itself recursive) trips
`TS2589: Type instantiation is excessively deep and possibly infinite`:

```ts
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
	| JsonPrimitive
	| JsonPrimitive[]
	| { [key: string]: JsonPrimitive | JsonPrimitive[] };
```

Widen it only if the data genuinely nests deeper — and expect TS2589 if you make
it recursive.

While there, check whether nullable value types are accurate:
`getAllBlockCollectionsData` declared `Record<string, X | null>` but its loop
only ever assigned non-null values, so the declaration was simply wrong.

### Independent props don't narrow each other

13 errors came from one narrowing gap. A component took
`mode: 'create' | 'edit'` and `instance: EnrichedInstance | null` as separate
props, with an early return for create mode — TypeScript cannot infer that edit
mode implies a non-null instance. A discriminated union would require narrowing
at the call site too; an explicit guard is cheaper and fixes all 13 at once:

```ts
// In edit mode the loader guarantees an instance (it throws 404 otherwise), but
// `mode` and `instance` are independent props so TypeScript cannot narrow one
// from the other. Guard explicitly.
if (!instance) {
	return null;
}
```

### Wrong `+types` import path

`Cannot find module '../+types/users'` was a plain typo — typegen emits
`+types/` as a **sibling of the route file**, so nested route files use
`./+types/<name>`, never `../`. Compare against a sibling that works
(`./+types/users.$id` was correct in the same directory).

## What remains, and why

8 vulnerabilities, all low or moderate, none production-blocking:

| Package                                    | Severity | Why deferred                                                                                                                                                                                                              |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ai-sdk/*`, `ai`                          | low      | Fix needs `@ai-sdk/openai@4.x`, a major bump with its own migration                                                                                                                                                       |
| `esbuild`, `@esbuild-kit/*`, `drizzle-kit` | moderate | Dev-only. Reaches us via `drizzle-kit`'s deprecated `@esbuild-kit/*` deps; `drizzle-kit` is already at latest, so it is upstream-blocked. npm's suggested "fix" is `drizzle-kit@0.18.1`, a **downgrade** — do not take it |

The esbuild advisory is a dev-server request/response issue: it does not apply
to deployed Workers.

Also expect `npm ls zod` to exit non-zero with
`invalid: "^3.24.1" from node_modules/@ai-sdk/provider-utils/node_modules/zod-to-json-schema`.
That is a pre-existing zod v3-vs-v4 mismatch inside the `@ai-sdk` chain,
unrelated to these upgrades, and it does not affect typecheck or build.

## Per-app checklist

```
[ ] Baseline: record typecheck count + per-file breakdown, and `npm audit` totals
[ ] zod -> ^4.4.3 FIRST (avoids the TS2742 detour later)
[ ] drizzle-orm -> ^0.45.2; grep sql.identifier / sql.as for real exposure
[ ] better-auth -> ^1.6.x + @better-auth/api-key; swap the apiKey import
[ ] Write + apply the apikey referenceId/configId migration (local)
[ ] Update the drizzle apikey schema to match
[ ] verifyApiKey: key.userId -> key.referenceId
[ ] listApiKeys: result -> result.apiKeys
[ ] Drop `type User` from 'better-auth/api'; infer instead
[ ] Session/User types -> Auth['$Infer']['Session']
[ ] Widen date formatters to accept Date
[ ] Grep 1.4/1.5 removed APIs (forgotPassword, accountInfo, adapters/test, ...)
[ ] typecheck -> 0; build green; dev server exercised
[ ] Verify a REAL api key end to end (see caveat below)
[ ] Remote migration sequenced with the deploy
```

## Caveat on verification

The invalid-key path was exercised (proper structured 401 against the migrated
table), but `result.key.referenceId` only executes for a **valid** key, which
needs an authenticated session to create. That single line is type-checked
against better-auth's own types and the column exists, but it was not
runtime-exercised. Create a real API key and call an API route with it before
trusting this in production.
