# React Router 7 → 8 migration

A repeatable runbook for our React Router + Cloudflare Workers apps. Written
while upgrading EdgeCMS; intended to be followed as-is for the remaining apps on
the same stack.

## Who this applies to

Apps with this signature:

- `react-router` + `@react-router/dev` v7, framework mode, `ssr: true`
- Cloudflare Workers runtime, `@cloudflare/vite-plugin`, `wrangler`
- A `workers/app.ts` entry calling `createRequestHandler`
- Vite 6
- Optionally D1 + drizzle + better-auth (these are orthogonal to the migration
  but show up in the audit noise)

## Status of this document

Verified by execution on EdgeCMS (2026-07-30):

- **Step 0** (baseline capture) — done
- **Step 1** (7.x security bump to 7.18.2) — done, builds clean, typecheck at
  parity with baseline
- **Step 2** (dependency floor) — done, no fallout
- **Step 3** (Vite 6 → 8) — done, build + dev server + emitted artifacts all
  verified, typecheck still at parity
- **Step 4** (env/context migration + all four future flags) — done, build + dev
  server + data-request formats verified, typecheck still at parity
- **Step 5** (v8.3.0 bump) — done. EdgeCMS is on `react-router@8.3.0` with a
  green build, a working dev server, typecheck back at the 39-error baseline,
  and zero react-router advisories remaining.

The full path has now been executed end to end on one app, so the ordering below
is a proven path rather than a plan. Exactly one code change was needed at Step
5 (see below).

Facts about v8 below come from three sources: the official
[upgrade guide](https://reactrouter.com/upgrading/v7), a freshly scaffolded
Cloudflare React Router template (more reliable than the guide, because it shows
the intended end state rather than the transition), and what actually happened
on EdgeCMS. Where they disagreed, the observed behavior is what is written down
— each step notes how it really went.

## Getting a reference template

Scaffold one and diff against it. It resolves ambiguities in the upgrade guide
faster than reading the guide does.

```sh
npm create cloudflare@latest <name>
```

Run it **interactively** and pick the React Router framework option. Do not try
to drive it with flags:
`npm create cloudflare@latest x -- --framework=react-router -y` silently ignores
`--framework` (the `-y` takes the default "Hello World" category) and hands you
a bare Worker with no Vite and no React Router. `--type=web-framework` is
rejected outright as an unknown type.

As of 2026-07-30 the template ships:

| Package                             | Template version |
| ----------------------------------- | ---------------- |
| `react-router`, `@react-router/dev` | `^8`             |
| `vite`                              | `^8.0.3`         |
| `react`, `react-dom`                | `^19.2.7`        |
| `@cloudflare/vite-plugin`           | `^1.48.0`        |
| `@types/node`                       | `^22.20.1`       |
| `tailwindcss`                       | `^4.2.2`         |
| `vite-tsconfig-paths`               | _not present_    |

Note the guide states a Vite **7** floor while the template ships Vite **8**.
From Vite 6 that is two majors either way.

## Step 0 — capture a baseline first

Do this before touching anything. It is the step most likely to be skipped and
the one that caused the most confusion on EdgeCMS.

```sh
git status --short                 # is the lockfile already dirty?
npm run typecheck 2>&1 | grep -cE 'error TS'
npm run typecheck 2>&1 | grep -E '\.tsx?\([0-9]+,[0-9]+\): error' \
	| sed 's/(.*//' | sort | uniq -c | sort -rn
npm run build
```

Save the error count **and the per-file breakdown**. Without them you cannot
tell your breakage from pre-existing breakage.

Why this matters concretely: EdgeCMS had an uncommitted `package-lock.json` with
~1450 changed lines carrying a much newer `wrangler`. Typecheck went from 22
errors (committed state) to 39 after the react-router bump, which read as "the
upgrade broke 17 things." It had not. Installing the _pre-existing dirty
lockfile_ with the _old_ react-router reproduced all 39 with an identical
per-file breakdown — the 17 extra errors were Cloudflare Workflow type changes
(`Serializable`, step-overload signatures) from the wrangler bump, in
`workers/*-workflow.ts`, entirely unrelated to routing.

**If the lockfile is dirty when you start, commit or stash it first.** If you
cannot, at minimum record the baseline from the dirty state, not from `HEAD`.

Isolation recipe when you need to attribute an error:

```sh
cp package-lock.json /tmp/lock.dirty            # keep the dirty one
git stash && npm ci && npm run typecheck        # committed baseline
cp /tmp/lock.dirty package-lock.json && npm ci  # dirty baseline, old deps
```

## Step 1 — go to latest 7.x (security, do this now)

This is independent of v8 and worth doing immediately on every app; v7 below
7.18 carries a critical.

```sh
npm ls react-router
npm view react-router versions --json | tr -d ' "' | tr ',' '\n' | grep '^7\.'
```

Bump `react-router` and `@react-router/dev` in `package.json` to `^7.18.2`
(latest 7.x as of 2026-07-30), then install.

### If npm deadlocks with ERESOLVE

Expect this. Symptom:

```
Found: @react-router/dev@7.6.2
Could not resolve dependency: dev @react-router/dev@"^7.18.2" from the root project
Conflicting peer dependency: react-router@7.18.2
```

It is nonsense on its face — 7.18.2 satisfies `^7.18.2`. The cause is the
lockfile: `@react-router/node` records an **exact** peer pin on the old
`react-router` (`"react-router": "7.6.2"`), which the resolver cannot reconcile
against the new root range. Deleting `node_modules` does not help; the pin is
read from `package-lock.json`.

Do **not** reach for `--force` or `--legacy-peer-deps` — this is a security
upgrade and you want a correct tree. Surgically drop the stale subtree and let
npm re-resolve only that, leaving every other pin intact:

```js
// node -e with this body, from the repo root
const fs = require('fs');
const l = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const k of Object.keys(l.packages)) {
	if (/(^|\/)node_modules\/(react-router|@react-router\/)/.test(k)) {
		delete l.packages[k];
	}
}
l.packages[''].dependencies['react-router'] = '^7.18.2';
l.packages[''].devDependencies['@react-router/dev'] = '^7.18.2';
fs.writeFileSync('package-lock.json', JSON.stringify(l, null, 2) + '\n');
```

Then `npm install`. On EdgeCMS this resolved cleanly and deduped all three
`@react-router/*` packages to 7.18.2.

### Fix the stabilized future flag

7.1x renames a flag that was `unstable_` in earlier 7.x. If the app sets it, the
build hard-errors until renamed:

```
Error: The `future.unstable_viteEnvironmentApi` flag has been stabilized as
`future.v8_viteEnvironmentApi`
```

```diff
 future: {
-	unstable_viteEnvironmentApi: true,
+	v8_viteEnvironmentApi: true,
 },
```

This is a 7.x-only stepping stone. The whole `future` block is deleted in
Step 5.

### Verify

```sh
npm run typecheck   # compare to Step 0 count, not to zero
npm run build
```

### What Step 1 buys you

On EdgeCMS: 19 → 13 audit vulnerabilities, criticals 3 → 1. Cleared 12
react-router advisories (aggregated vulnerable range `6.0.0 - 7.17.0`),
including a critical path traversal in `@react-router/node` file session storage
and an unauthenticated RCE via vendored turbo-stream, plus a transitive
`valibot` ReDoS.

### One advisory 7.x cannot fix

[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) (high,
RSC-mode CSRF bypass) covers `>=7.12.0 <8.3.0`. Note the lower bound: apps below
7.12 are _outside_ it, so upgrading to 7.18.2 **moves you into** this advisory's
range. Only 8.3.0 clears it.

It is only reachable in RSC mode. Check before treating it as urgent:

```sh
grep -rn "@vitejs/plugin-rsc\|@react-router/rsc\|routeRSC" \
	--include='*.ts' --include='*.tsx' app/ workers/ vite.config.ts
```

Classic-SSR apps (`ssr: true`, no RSC plugin) are not exposed. That makes v8 a
"schedule it" upgrade rather than an emergency — on EdgeCMS the pinned
`better-auth` critical and the `drizzle-orm` SQL injection ranked higher.

## Step 2 — raise the dependency floor

Low risk, independent of react-router. Do it separately so it does not
contaminate the Vite bisect.

- `react`, `react-dom` → `^19.2.7` (v8 minimum)
- `@types/node` → `^22`
- `tailwindcss` → `^4.2.2` if you track the template

Also confirm the toolchain Node satisfies **22.22+**:

```sh
node -v
cat .nvmrc 2>/dev/null; grep -n '"engines"' -A4 package.json
ls .github/workflows/ 2>/dev/null && grep -rn "node-version" .github/workflows/
```

This is a _build toolchain_ requirement. The Workers runtime is workerd, so it
is unaffected — but CI images, `.nvmrc`, and `engines` all need to agree.
EdgeCMS had none of those files, so nothing to update; other apps may differ.

## Step 3 — Vite 6 → 8

The largest step. Do it **while still on react-router 7.18.2** so a broken build
can be bisected against one variable.

- `vite` → `^8`
- `@cloudflare/vite-plugin` → `^1.48.0`
- Drop `vite-tsconfig-paths` entirely — Vite 8 does it natively:

```diff
-import tsconfigPaths from 'vite-tsconfig-paths';
 export default defineConfig({
 	plugins: [
 		cloudflare({ viteEnvironment: { name: 'ssr' } }),
 		tailwindcss(),
 		reactRouter(),
-		tsconfigPaths(),
 	],
+	resolve: { tsconfigPaths: true },
 });
```

The template's `vite.config.ts` is otherwise nearly identical to ours, including
`cloudflare({ viteEnvironment: { name: 'ssr' } })`, so the plugin list needs no
other changes.

Per the upgrade guide, custom **SSR** build config moves under
`environments.ssr.build`:

```diff
-export default defineConfig(({ isSsrBuild }) => ({
-	build: { rollupOptions: isSsrBuild ? { input: './server/app.ts' } : undefined },
-}));
+export default defineConfig({
+	environments: { ssr: { build: { rollupOptions: { input: './server/app.ts' } } } },
+});
```

### Custom build layouts get no help from the template

The template has no custom output paths and no `assets` block (it is commented
out). Any app that customizes these is on its own — verify by inspecting build
artifacts, not just exit codes. EdgeCMS carries all three of:

- `build.outDir: 'dist/edge-cms'` and `build.assetsDir: 'edge-cms/assets'`
- a local `wranglerAssetsDir()` plugin hooking `generateBundle` to rewrite the
  emitted `wrangler.json`'s `assets.directory` to `../client` — this is
  environment-API-coupled via `applyToEnvironment(env => env.name === 'ssr')`
  and is the single most likely thing to break
- `routeDiscovery: { mode: 'lazy', manifestPath: '/edge-cms/__manifest' }`

After building, check that the emitted `wrangler.json`, the client asset paths,
and the URL prefix all still look right — a green build does not prove the asset
directory rewrite still landed.

```sh
node -e 'const w=require("./build/server/wrangler.json"); console.log(JSON.stringify(w.assets))'
ls build/client/ build/client/<your-prefix>/
```

On EdgeCMS the `wranglerAssetsDir()` plugin survived untouched — emitted
`assets.directory` was still `"../client"` and the `edge-cms/assets` prefix was
intact. So the `applyToEnvironment` / `generateBundle` hooks carry over from
Vite 6 to 8 as-is. Encouraging, but still verify per app.

### Vite 8 wrinkles seen in practice

- **Vite 8 bundles with Rolldown, not Rollup.** Build logs come from
  `builtin:vite-reporter` and advise `build.rolldownOptions` where Vite 6 said
  `build.rollupOptions`. Any app that actually _sets_ `rollupOptions` (including
  the `environments.ssr.build.rollupOptions` migration above) should confirm the
  option is still honored. Chunk names and the chunk split also change, so
  anything asserting on built filenames will need updating.
- **`envFile` deprecation warning** on dev startup: "The `envFile` option is
  deprecated, please use `envDir: false` instead." Emitted from inside the
  toolchain, not our config — noise, not actionable, but expect it.
- One nested `vite@7` may remain under `@react-router/dev`'s `vite-node`. It is
  an isolated transitive copy, harmless, and clears at Step 5.

### Verify with the dev server, not just the build

The Vite 8 environment API plus `@cloudflare/vite-plugin` in **dev** is the
riskiest untested combination, and `npm run build` does not cover it.

```sh
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:5173/
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:5173/<your-prefix>
```

Both returned 200 on EdgeCMS. Dev startup also prints the exact list of
remaining future flags, which is a free checklist for Step 4:

```
⚠️  Future Flag Warning: Route middleware support is changing in React Router v8.
    You can use the `future.v8_middleware` flag to opt in early.
⚠️  Future Flag Warning: Route module splitting behavior is changing ...
    ... `future.v8_splitRouteModules` ...
⚠️  Future Flag Warning: Request handling behavior is changing ...
    ... `future.v8_passThroughRequests` ...
⚠️  Future Flag Warning: Data request URL formats are changing ...
    ... `future.v8_trailingSlashAwareDataRequests` ...
```

### Versions this landed on

EdgeCMS after Step 3, for reference when the ranges drift:

| Package                            | Range      | Resolved |
| ---------------------------------- | ---------- | -------- |
| `vite`                             | `^8`       | 8.1.5    |
| `@cloudflare/vite-plugin`          | `^1.48.0`  | 1.48.x   |
| `@tailwindcss/vite`, `tailwindcss` | `^4.2.2`   | 4.3.3    |
| `react`, `react-dom`               | `^19.2.7`  | 19.2.8   |
| `@types/node`                      | `^22`      | 22.20.1  |
| `@types/react`                     | `^19.2.14` | 19.2.17  |

## Step 4 — migrate off `context.cloudflare`

v8 makes middleware unconditional, which changes the loader/action `context`
into a `RouterContextProvider`. Any `context.cloudflare.env` access breaks.

The template shows the intended replacement is **ambient env**, not rebuilding
context plumbing:

```ts
import { env } from 'cloudflare:workers';

export function loader() {
	return { message: env.SOME_BINDING };
}
```

And the template's `workers/app.ts` passes **no second argument**:

```ts
const requestHandler = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
);

export default {
	async fetch(request) {
		return requestHandler(request);
	},
} satisfies ExportedHandler<Env>;
```

### Audit each app before assuming this is easy

```sh
grep -rn "context\.cloudflare" --include='*.ts' --include='*.tsx' app/ workers/
grep -rnE '\bctx\b|waitUntil' --include='*.ts' --include='*.tsx' app/ workers/
grep -rn "AppLoadContext" --include='*.ts' --include='*.tsx' app/ workers/
```

The `ctx` grep is the decisive one. If `ctx` appears **only** as plumbing inside
`workers/app.ts` and nothing calls `ctx.waitUntil`, you can delete the
`AppLoadContext` module augmentation and the second `requestHandler` argument
outright. If something does consume `ctx`, you need a real replacement and this
step is no longer cheap — budget for it.

On EdgeCMS: 3 `context.cloudflare.env` sites across 2 files
(`app/routes/edge-cms/_layout.tsx`, `app/routes/edge-cms/users/users.tsx`), and
`ctx` appeared only in `workers/app.ts` as plumbing. Small change.

Keep any custom `fetch` wrapper (CORS, trusted-origin checks) and any
`WorkflowEntrypoint` exports — the template has neither, but they are unaffected
by the context change. Note that they wrap the handler you are editing, so
re-read the whole `fetch` after the edit.

### Also required by v8, independent of context

Audit and fix each of these:

```sh
# react-router-dom is deleted in v8 — no compat shim remains
grep -rn "react-router-dom" --include='*.ts' --include='*.tsx' app/ workers/
# RouterProvider moved to react-router/dom (data mode only)
grep -rn "RouterProvider" --include='*.ts' --include='*.tsx' app/
# meta()/useMatches(): `data` removed in favor of `loaderData`
grep -rn "useMatches" --include='*.ts' --include='*.tsx' app/
grep -rn -A4 'export function meta\|export const meta' --include='*.tsx' app/
# RR's Cloudflare dev proxy removed; use @cloudflare/vite-plugin
grep -rn "cloudflareDevProxy" vite.config.ts
```

Two more from the guide worth grepping for:

- **`v8_passThroughRequests`** — `request` is no longer normalized, so `.data`
  suffixes and `?index` leak into `request.url`. Routing logic must use the new
  `url` loader/action arg. Find candidates with
  `grep -rn "new URL(request.url)" --include='*.ts' --include='*.tsx' app/`.
  Most hits are search-param reads and are safe; each still needs a look.
  EdgeCMS had 7 across 7 files.
- **`v8_trailingSlashAwareDataRequests`** — data request paths change format:
  `/a/b/c.data` → `/a/b/c/_.data`, and root `/_root.data` → `/_.data`. Update
  any CDN, cache, or rewrite rules keyed on `.data`. Grep the app _and_ the
  infra config. Apps with a custom `routeDiscovery.manifestPath` or a URL prefix
  should confirm data requests still route to the Worker.

Where these flags exist in 7.1x, enable them **one at a time on 7.18.2** and fix
the fallout before moving on. That is the whole point of the flag mechanism —
arriving at Step 5 with all of them on should make the major bump uneventful.

### How Step 4 actually went on EdgeCMS

Cheaper than expected, for a reason worth checking on every app first:

```sh
grep -rl "cloudflare:workers" --include='*.ts' --include='*.tsx' app/ workers/ | wc -l
grep -rl "context\.cloudflare"  --include='*.ts' --include='*.tsx' app/ workers/ | wc -l
```

**40 files already imported `env` from `cloudflare:workers`; only 2 still used
`context.cloudflare`.** The v8-recommended pattern was already the house style
and the remaining sites were stragglers. Run that pair of greps before planning
this step — you may be converting 3 leftovers rather than migrating an app. One
of the sites (`users.$id.tsx`) even destructured `context` while its body
already used the imported `env`, so the parameter was simply dead.

`workers/app.ts` lost the `AppLoadContext` module augmentation, the `ctx`
parameter, and the second `requestHandler` argument, keeping the CORS wrapper
and the `WorkflowEntrypoint` exports untouched:

```diff
-declare module 'react-router' {
-	export interface AppLoadContext {
-		cloudflare: { env: Env; ctx: ExecutionContext };
-	}
-}
-	async fetch(request, env, ctx) {
+	async fetch(request, env) {
-		const response = await requestHandler(request, {
-			cloudflare: { env, ctx },
-		});
+		const response = await requestHandler(request);
```

`env` stays in the `fetch` signature because the CORS wrapper reads
`env.TRUSTED_ORIGINS` — that is Worker-level env, unrelated to the loader
change.

One leftover to watch at Step 5: `app/entry.server.tsx` still imports
`AppLoadContext` as a _type_ for its `_loadContext` parameter. That is the
framework-required entry signature, it is unused, and it was fine on 7.18.2 —
but v8 replaces the load context with `RouterContextProvider`, so custom
`entry.server` files are a likely touch point.

### All four flags: results

Enabled one at a time, each followed by typecheck + build, with a dev smoke test
after the two runtime-affecting ones. Typecheck stayed at the 39-error baseline
throughout and every build was green.

| Flag                                | Code changes needed                       |
| ----------------------------------- | ----------------------------------------- |
| `v8_middleware`                     | none — Step 4 was the prerequisite        |
| `v8_splitRouteModules`              | none, as documented                       |
| `v8_passThroughRequests`            | none, but only after auditing all 7 sites |
| `v8_trailingSlashAwareDataRequests` | none                                      |

`v8_passThroughRequests` looked like the risky one and was not: all 7
`new URL(request.url)` sites read **only `searchParams`**, never `pathname`.
Since the flag changes the pathname (adds the `.data` suffix) and appends
`?index` for index routes, search-param-only code is unaffected. Check two
things per site: does it read `pathname`, and does it read a param named
`index`. If neither, it is safe.

Verify the data-request format change with real requests:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/_.data       # 200 — new root format
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/_root.data   # 404 — old format retired
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/<prefix>/_.data  # 202 = redirect payload
```

Two things that look like failures but are not: a `202` on a data request is
single-fetch encoding a redirect (expected for auth-gated routes), and probing
`/_root.data` logs `Error: No route matches URL "/_root"` server-side — that is
the flag working, provoked by your own probe.

**The dev-startup future-flag warnings are the completion signal.** When
`grep -c 'Future Flag Warning'` on the dev log hits `0`, every flag is adopted
and Step 5 is unblocked.

## Step 5 — the v8 bump

By now this should be small.

```sh
npm install react-router@^8 @react-router/dev@^8
```

Then **delete the `future` block entirely**. v8 has no `v8_*` flags; their
behavior is now the default. The template's entire config is:

```ts
import type { Config } from '@react-router/dev/config';

export default {
	ssr: true,
} satisfies Config;
```

Keep app-specific keys such as `routeDiscovery`. Only `future` goes away.

v8 is also **ESM-only**. Confirm `"type": "module"` in `package.json` — all our
apps already have it.

Not applicable to this stack, listed for completeness: `@react-router/architect`
changes its domain-name source to `event.requestContext.domainName` instead of
`X-Forwarded-Host`.

### How Step 5 actually went on EdgeCMS

**The ERESOLVE deadlock recurs here.** Same shape as Step 1 — the lockfile pins
`@react-router/node`'s peer to the exact old version. Reuse the surgery script
from Step 1 with `^8.3.0`.

Order matters: **edit `package.json` first, then the lockfile.** Running the
surgery with only the lockfile updated is a no-op — npm reconciles against
`package.json`, silently re-resolves back to 7.18.2, and rewrites your lockfile
edit. It reports success, so check `npm ls react-router` afterwards rather than
trusting the exit code.

**Exactly one code change was required.** `app/entry.server.tsx` — the leftover
flagged in Step 4:

```
app/entry.server.tsx(1,15): error TS2305:
Module '"react-router"' has no exported member 'AppLoadContext'.
```

`AppLoadContext` is deleted in v8; `RouterContextProvider` replaces it:

```diff
-import type { AppLoadContext, EntryContext } from 'react-router';
+import type { EntryContext, RouterContextProvider } from 'react-router';
 	routerContext: EntryContext,
-	_loadContext: AppLoadContext,
+	_loadContext: RouterContextProvider,
```

Any app with a custom `entry.server.tsx` will hit this. The scaffolded template
has none, so it gives no guidance — this is the one place the template cannot
help.

Nothing else changed. `routeDiscovery` with its custom `manifestPath` carried
over untouched, as did the CORS wrapper, the Workflow exports, and the
`wranglerAssetsDir()` plugin.

### Verified on v8

```
document routes    /  /edge-cms  /edge-cms/{users,i18n,media,sections,blocks}
                   /edge-cms/i18n/versions  /edge-cms/settings/api-keys       200
API key gate       /edge-cms/api/i18n/pull                                    401
data requests      /_.data 200   /<prefix>/_.data 202 (redirect payload)
manifest           /edge-cms/__manifest?p=/edge-cms                           204
typecheck          39 — identical per-file breakdown to the Step 0 baseline
build              green;  emitted wrangler.json assets.directory = "../client"
```

When probing routes, get the paths from `app/routes.ts` rather than guessing —
two of our 404s were bad guesses at URLs (`/edge-cms/versions` is really
`/edge-cms/i18n/versions`). Distinguish a routing 404 from a loader 404 by the
body: routing misses render the HTML error boundary, loader 404s return their
own text.

### Audit payoff

19 → 13 → **10** vulnerabilities across the whole migration; react-router
advisories went to **zero**, including the RSC-mode
[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) that no
7.x release could fix. What remains is unrelated to routing: `better-auth`
(critical, pinned to an exact version) and `drizzle-orm` (high, SQL injection
below 0.45.2). Triage those separately.

## Per-app checklist

Copy this per repo.

```
[ ] Step 0  lockfile committed/stashed; typecheck count + per-file breakdown recorded; build green
[ ] Step 1  react-router + @react-router/dev -> ^7.18.2 (lockfile surgery if ERESOLVE)
[ ] Step 1  unstable_viteEnvironmentApi -> v8_viteEnvironmentApi (if present)
[ ] Step 1  typecheck at baseline parity; build green; npm audit delta recorded
[ ] Step 1  RSC grep -> is GHSA-qwww-vcr4-c8h2 actually reachable?
[ ] Step 2  react/react-dom ^19.2.7; @types/node ^22; Node 22.22+ in .nvmrc/engines/CI
[ ] Step 3  vite ^8; @cloudflare/vite-plugin ^1.48.0; drop vite-tsconfig-paths
[ ] Step 3  custom outDir/assetsDir/assets-rewrite plugin verified by INSPECTING artifacts
[ ] Step 4  ctx grep -> is the cheap path available?
[ ] Step 4  context.cloudflare.env -> cloudflare:workers env; drop AppLoadContext + 2nd arg
[ ] Step 4  react-router-dom / useMatches / meta data / cloudflareDevProxy greps clean
[ ] Step 4  new URL(request.url) sites reviewed for .data leakage
[ ] Step 4  .data path rules in CDN/cache/infra updated
[ ] Step 4  all four v8_* flags on, one at a time; dev log shows 0 flag warnings
[ ] Step 5  package.json FIRST, then lockfile surgery; confirm with npm ls react-router
[ ] Step 5  entry.server.tsx AppLoadContext -> RouterContextProvider (if custom entry)
[ ] Step 5  delete future block; "type": "module" confirmed
[ ] Post    typecheck at baseline parity; build green; app exercised in dev
[ ] Post    npm audit: react-router advisories at zero
```

## Notes for the next app

- Compare against a freshly scaffolded template rather than reasoning from the
  guide. It caught two things the guide alone did not: that Vite 8 (not 7) is
  what ships, and that the intended context replacement is
  `import { env } from 'cloudflare:workers'` rather than context plumbing.
- A green `npm run build` is weak evidence for apps with custom output layouts.
  Inspect artifacts.
- `npm run typecheck` returning a nonzero count is not automatically your fault.
  Diff the per-file breakdown against Step 0 before investigating.
- Pre-existing type errors in `workers/*-workflow.ts` on the EdgeCMS-lineage
  apps are Cloudflare Workflow typing drift from `wrangler` bumps, not routing.
  They need their own cleanup pass and should not block this migration.
- Unrelated but usually louder in `npm audit` than react-router: `better-auth`
  (often pinned to an exact version, so it needs a deliberate bump) and
  `drizzle-orm` (SQL injection below 0.45.2). Triage separately.
