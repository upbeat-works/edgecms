# React Router 7 → 8 migration

A repeatable runbook for our React Router + Cloudflare Workers apps. Written
while upgrading EdgeCMS; intended to be followed as-is for the remaining apps on
the same stack.

For the non-framework dependencies on the same stack — better-auth, drizzle-orm,
zod — see [dependency-upgrades.md](./dependency-upgrades.md). The two are
independent; either can go first.

## Who this applies to

Apps with this signature:

- `react-router` + `@react-router/dev` v7, framework mode, `ssr: true`
- Cloudflare Workers runtime, `@cloudflare/vite-plugin`, `wrangler`
- A `workers/app.ts` entry calling `createRequestHandler`
- Vite 6
- Optionally D1 + drizzle + better-auth (these are orthogonal to the migration
  but show up in the audit noise)

### Triage the app's shape first

Two greps decide whether this is a one-file migration or a nine-file one. Run
them before estimating:

```sh
# 1. Is the app already on the middleware future flag?
grep -rn "unstable_middleware\|unstable_createContext\|unstable_RouterContextProvider" \
	--include='*.ts' --include='*.tsx' app/ workers/ react-router.config.ts
# 2. Does anything else in the tree peer-depend on react-router?
npm ls react-router
```

If grep 1 is empty and `npm ls react-router` shows only `@react-router/*`, you
have the EdgeCMS shape: follow the steps as written and expect ~1 code change.

If either hits, read
[Variant: apps already on the middleware flag](#variant-apps-already-on-the-middleware-flag)
**before starting** — several changes the guide places at Step 5 actually land
at Step 1 for you, and one of them is a silent runtime break.

## Status of this document

Executed end to end on two apps:

| App        | Outcome                                                             |
| ---------- | ------------------------------------------------------------------- |
| EdgeCMS    | 7.6.2 → 8.3.0. One code change (`entry.server.tsx`).                 |
| casa-barre | 7.6.3 → 8.3.0. Nine files. Two real bugs found — see [Variant: apps already on the middleware flag](#variant-apps-already-on-the-middleware-flag). |

The steps and their ordering held on both. What did **not** hold was the
estimate of how much code changes at each step: EdgeCMS was a classic-SSR app
with no middleware and no third-party react-router dependents, which is the
_easy_ shape. Read the variant section before estimating.

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
casa-barre was migrated this way — unrelated in-progress work in the tree, so
the baseline was taken from the dirty state and that work left untouched. It
works, provided you record the baseline *before* the first `npm install`.

Two more baseline notes:

- **A clean baseline is a real outcome.** casa-barre started at 0 typecheck
  errors and a green build. The guide's prose assumes pre-existing noise; when
  there is none, any error you see later is unambiguously yours, which makes the
  migration considerably easier to reason about.
- **Capture a dev-server baseline too, not just typecheck + build,** if the app
  has middleware or does routing work in loaders. `npm run build` does not
  exercise the request path, and without a "before" you cannot tell a stale-HMR
  500 from a regression. Record status codes for a handful of real routes (get
  them from `app/routes.ts`) plus a data request.

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

They do differ, and CI is the one that bites: casa-barre pinned
`node-version: 20` in two jobs in `.github/workflows/deploy.yml` (while a third
job already used 22). A local `node -v` of 24 tells you nothing about CI — this
would have built fine on the dev machine and failed on deploy. Check every pin,
not just the first, and note that pins are usually duplicated per job:

```sh
grep -rn "node-version" .github/workflows/
```

Also pin the version ranges to something that exists — `@types/react-dom` tracks
its own numbering and lags `@types/react` (19.2.3 vs 19.2.17 as of 2026-07-30),
so a guessed `^19.2.9` fails with `ETARGET No matching version found`. Confirm
with `npm view <pkg> version` before editing `package.json`.

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

If the app is already on the middleware flag, run this grep at **Step 1**
instead — a typecheck error there forces the decision early. See
[Variant: apps already on the middleware flag](#variant-apps-already-on-the-middleware-flag).
Note also that `context.cloudflare` is only the EdgeCMS-lineage spelling; an app
with its own `createContext` key needs the same audit under a different name.

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
  EdgeCMS had 7 across 7 files. **That grep is too narrow** — it misses helpers
  that take a `Request` and derive the URL internally, and middleware callbacks
  that never see the normalized `url` at all. Prefer
  `grep -rn "\.pathname" --include='*.ts' --include='*.tsx' app/`, and read
  [the variant section](#v8_passthroughrequests-really-can-break-routing) if the
  app routes on the pathname — on casa-barre this flag caused an infinite
  redirect loop reachable only through client-side navigation.
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

## Variant: apps already on the middleware flag

Written while upgrading casa-barre (2026-07-30), which was already running
`future.unstable_middleware` with a custom `unstable_createContext` and used
`remix-i18next`'s middleware. Everything here is **in addition to** the steps
above; the ordering of the steps themselves did not change.

The headline: being "ahead" on the middleware flag does **not** make the
migration cheaper. It front-loads it. Three things the guide places at Step 5
land at Step 1, and one of them fails silently.

### Step 1 also stabilizes the middleware flag and the context API

7.18.2 renames more than `viteEnvironmentApi`, and it **removes** the
`unstable_` context exports rather than aliasing them:

```diff
 // react-router.config.ts — the augmentation needs renaming too, not just the flag
 declare module 'react-router' {
 	interface Future {
-		unstable_middleware: true;
+		v8_middleware: true;
 	}
 }
 export default {
 	ssr: true,
 	future: {
-		unstable_middleware: true,
-		unstable_viteEnvironmentApi: true,
+		v8_middleware: true,
+		v8_viteEnvironmentApi: true,
 	},
 } satisfies Config;
```

```diff
-import { unstable_createContext } from 'react-router';
+import { createContext } from 'react-router';
-import { type unstable_RouterContextProvider } from 'react-router';
+import { type RouterContextProvider } from 'react-router';
```

Confirm the names against the installed package rather than guessing — the full
flag list is one grep:

```sh
grep -ohE "v8_[a-zA-Z]+" node_modules/@react-router/dev/dist/config.d.ts | sort -u
grep -c "unstable_createContext" node_modules/react-router/dist/development/index.d.ts  # 0 on 7.18.2
```

With `v8_middleware` on, `createRequestHandler`'s second argument must be a real
`RouterContextProvider`; a plain `Map` no longer typechecks
(`Property '#private' is missing in type 'Map<...>'`). Either wrap it
(`new RouterContextProvider(map)`) or — much better — check whether the context
is dead first. On casa-barre nothing ever read it:

```sh
grep -rn "context\.get(\|\.get(yourContext)" --include='*.ts' --include='*.tsx' app/
```

Nothing consumed it, and 11 files already imported `env` from
`cloudflare:workers`, so the whole context module was deleted and `workers/app.ts`
went straight to the v8 end state at Step 1. **Run the Step 4 `ctx` grep during
Step 1** — this decision is forced early for middleware apps, and taking the
cheap path now avoids writing code you delete at Step 5.

### The route export renames too — and fails silently

This is the one to watch. `unstable_middleware` is also the **route module
export name**, and the `v8_middleware` flag renames it to `middleware`:

```diff
 // app/root.tsx
-export const unstable_middleware = [i18nextMiddleware];
+export const middleware = [i18nextMiddleware];
```

Miss it and the middleware simply stops being registered — no error, no warning.
On casa-barre it surfaced only as a *client* build failure, because the stale
export is no longer in the framework's server-only list, so the middleware
module stopped being tree-shaken out of the browser bundle:

```
[vite]: Rollup failed to resolve import "cloudflare:workers"
from "app/middleware/i18next.ts"
```

A `cloudflare:workers` (or other server-only) import suddenly failing to resolve
in the **client** build is the signature of a route export that is no longer
recognized. Do not "fix" it by externalizing the import — find the renamed
export. Grep for it explicitly, since a green typecheck will not catch it:

```sh
grep -rn "export const unstable_" --include='*.tsx' --include='*.ts' app/
```

### Third-party packages that peer-depend on react-router

The guide assumed `@react-router/*` are the only packages tracking the major.
Anything else in `npm ls react-router` needs its own upgrade, planned across
**two** steps, because these packages track react-router's majors:

```sh
npm ls react-router   # who else depends on it?
```

`remix-i18next` needed two bumps on casa-barre:

| Step   | Version  | Why                                                          |
| ------ | -------- | ------------------------------------------------------------ |
| Step 1 | `^7.5.0` | 7.2.1 imports the now-deleted `unstable_createContext`, which breaks the **SSR build**, not just types. 7.4.2+ uses stable `createContext`. |
| Step 5 | `^8.0.0` | peers `react-router@^8`.                                     |

The Step 1 failure is worth recognizing by shape — a dependency's own source
referencing an export the new react-router no longer has:

```
node_modules/remix-i18next/build/middleware.js (2:9): "unstable_createContext"
is not exported by "node_modules/react-router/dist/development/index.mjs"
```

When a package's peer range alone doesn't tell you whether it uses the stable
API, read the published file instead of guessing:

```sh
npm pack <pkg>@<version> && tar xzf <pkg>-<version>.tgz
grep -nE "^import" package/build/<entry>.js
```

Majors of these packages also drop deprecated APIs and reshape their export
maps. `remix-i18next@8` collapsed to a single `.` entrypoint (`/middleware` and
`/react` subpaths gone) and deleted `useChangeLanguage`.

When a major deletes a deprecated API, **read why it was deprecated before
re-creating it.** The reflex is to copy the removed implementation into the app
and keep the call site untouched. That restores the build in one step, but it
also re-creates the thing upstream deliberately removed, and it leaves a local
module whose only purpose is to imitate a dead API.

`useChangeLanguage` was a thin wrapper around a guarded effect, and its own
deprecation note said to call `i18n.changeLanguage(...)` with the root loader's
locale instead. Inlining the effect at the call site is what upstream meant:

```diff
-import { useChangeLanguage } from 'remix-i18next/react';
+import { useEffect } from 'react';

 export default function App({ loaderData }: Route.ComponentProps) {
-	useChangeLanguage(loaderData.locale);
+	const { i18n } = useTranslation();
+	const { locale } = loaderData;
+
+	useEffect(() => {
+		if (i18n.language !== locale) void i18n.changeLanguage(locale);
+	}, [locale, i18n]);
```

Do keep the effect and the `i18n.language !== locale` guard. Upstream's one-line
phrasing ("call `i18n.changeLanguage(loaderData.locale)`") reads as though it
belongs in the component body, but that is a render-phase side effect. The
effect is still required for client-side navigations between locales — the root
loader returns the new locale and the client i18next instance has to follow it.

On casa-barre this left `app/hooks/use-change-language.ts` byte-identical to
`HEAD`: the migration touched the call site only. A useful signal that the
replacement was the right shape — if a removed-API workaround leaves a new file
behind, it is probably a re-implementation rather than a migration.

If a package exports the args type only implicitly, derive it the same way the
package does rather than reaching into its internals:

```ts
type LanguageDetectorArgs = Parameters<MiddlewareFunction<Response>>[0];
```

### `v8_passThroughRequests` really can break routing

The guide's EdgeCMS result — "all 7 sites read only `searchParams`, so no code
changes" — is the best case, not the rule. Any app that does **locale, tenant,
or section routing from the pathname** will break, and the audit grep in Step 4
is too narrow to find it. Widen it:

```sh
# not just `new URL(request.url)` — any pathname read, and every caller
grep -rn "\.pathname" --include='*.ts' --include='*.tsx' app/
```

On casa-barre this produced an **infinite redirect loop**, reachable only via
client-side navigation. `/en` rendered fine as a document, but its data request
`/en.data` made the locale segment read as `en.data`, which is not a supported
language, so the layout loader redirected — to `/en.data`, forever:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/en.data   # 202
curl -s http://localhost:5173/en.data | head -c 120
# [["SingleFetchRedirect",1],...,"redirect","/en.data","status",302,...
```

**A 202 on a data request whose document is a 200 means the loader is
redirecting only for data requests** — that is this bug. The guide notes 202 is
"expected for auth-gated routes"; that is only true when the document redirects
too. Compare the pair.

The fix is the normalized `url` argument, which exists on `LoaderFunctionArgs`,
`ActionFunctionArgs` **and** middleware args (all extend `DataFunctionArgs`):

```diff
-export async function loader({ request, params }: Route.LoaderArgs) {
-	const url = new URL(request.url);
+export async function loader({ request, params, url }: Route.LoaderArgs) {
```

Push `URL` across helper boundaries rather than re-deriving it — helpers taking
a `Request` and calling `new URL(request.url)` internally are exactly where this
bug hides, and the compiler will then find every caller for you:

```diff
-export function backwardsCompatRedirect(request: Request) {
-	const url = new URL(request.url);
+export function backwardsCompatRedirect(url: URL) {
```

That signature change surfaced a fourth call site the original greps missed.

**Middleware is the gap.** Loaders get `url`, but a third-party middleware may
hand your callback the raw `Request`. `remix-i18next@7.5.0` does exactly that
(`findLocale(request)`), so on 7.18.2 there is no normalized URL available and
the pathname must be de-suffixed by hand:

```ts
function stripDataSuffix(pathname: string) {
	if (pathname === '/_root.data' || pathname === '/_.data') return '/';
	if (pathname.endsWith('/_.data')) return pathname.slice(0, -'/_.data'.length);
	if (pathname.endsWith('.data')) return pathname.slice(0, -'.data'.length);
	return pathname;
}
```

`remix-i18next@8` changes `findLocale` to receive the full middleware args, so
this workaround is deleted at Step 5. Expect interim hacks like this whenever a
third-party package sits between you and the framework's normalized arguments —
write them so they are easy to remove, and remove them.

### Verify data requests carry the right state, not just a 200

Status codes alone would have missed the locale bug once it was half-fixed.
Assert on payload content per route:

```sh
for p in /_.data /en/_.data /ca/_.data; do
	printf '%-16s ' "$p"
	curl -s "http://localhost:5173$p" | grep -oE '"locale","[a-z]{2}"' | head -1
done
# /_.data          "locale","es"
# /en/_.data       "locale","en"
# /ca/_.data       "locale","ca"
```

### Two smaller things

- **`meta()` `data` → `loaderData` is a real hit at Step 5,** not just a grep
  item: `Property 'data' does not exist on type 'CreateMetaArgs<...>'`. Renaming
  in the destructure keeps the body untouched:
  `({ data })` → `({ loaderData: data })`.
- **A 500 that renders full HTML is probably stale HMR,** not a regression.
  Restart the dev server before investigating. `entry.server.tsx` deliberately
  swallows errors when `!shellRendered`, so there is no stack trace to find; if
  you must see it, add a temporary `else` branch to that `onError` — and remove
  it afterwards.

### Verified on casa-barre (2026-07-30)

```
documents      / /en /ca  /madrid/horarios  /en/madrid/horarios
               /legal/terminos-y-condiciones  /sitemap.xml /robots.txt      200
locale strip   /es -> /            /es/madrid/horarios -> /madrid/horarios  302
back-comparat  /madrid /barcelona -> /                                      301
               /terminos -> /legal/terminos-y-condiciones                   301
data requests  /_.data /en/_.data /ca/_.data /en/madrid/horarios/_.data     200
               payload locale correct per route (es / en / ca / en)
typecheck      0 — same as the Step 0 baseline
build          green;  emitted wrangler.json assets.directory = "../client"
lint           clean (1 pre-existing warning in unrelated in-progress work)
audit          30 -> 14 vulns; 3 criticals -> 0; react-router advisories zero
```

Final versions: `react-router` / `@react-router/dev` 8.3.0, `remix-i18next`
8.0.0, `vite` 8.2.0, `@cloudflare/vite-plugin` 1.48.0, `react` 19.2.8,
`tailwindcss` 4.3.3.

Files touched, for scale: `react-router.config.ts`, `vite.config.ts`,
`workers/app.ts`, `app/adaptor-context.ts` (deleted), `app/entry.server.tsx`,
`app/root.tsx`, `app/middleware/i18next.ts`, `app/routes/locale.tsx`,
`app/routes/catch-all.tsx`, `app/utils/backwards-compat-redirect.ts`,
`.github/workflows/deploy.yml`.

**Not verified by this run:** client-side navigation between locales. The
locale-sync effect in `root.tsx` only runs on a client transition, which `curl`
cannot exercise — SSR, data-request payloads and build output all pass without
touching it. Click through the locale switcher once in a browser before
shipping, or add a route-level test.

## Per-app checklist

Copy this per repo.

```
[ ] Step 0  SHAPE: middleware-flag grep + `npm ls react-router` -> which variant is this?
[ ] Step 0  lockfile committed/stashed; typecheck count + per-file breakdown recorded; build green
[ ] Step 0  dev-server baseline recorded (route status codes + a data request)
[ ] Step 1  react-router + @react-router/dev -> ^7.18.2 (lockfile surgery if ERESOLVE)
[ ] Step 1  unstable_viteEnvironmentApi -> v8_viteEnvironmentApi (if present)
[ ] Step 1  unstable_middleware -> v8_middleware, in future block AND Future augmentation
[ ] Step 1  unstable_createContext/unstable_RouterContextProvider -> stable names (REMOVED in 7.18.2)
[ ] Step 1  `export const unstable_middleware` -> `export const middleware` (SILENT break)
[ ] Step 1  third-party react-router dependents bumped to a stable-createContext release
[ ] Step 1  ctx grep run EARLY if on middleware; take the cheap path if context is dead
[ ] Step 1  typecheck at baseline parity; build green; npm audit delta recorded
[ ] Step 1  RSC grep -> is GHSA-qwww-vcr4-c8h2 actually reachable?
[ ] Step 2  react/react-dom ^19.2.7; @types/node ^22; Node 22.22+ in .nvmrc/engines/CI
[ ] Step 2  EVERY node-version pin in CI checked (they repeat per job), versions confirmed to exist
[ ] Step 3  vite ^8; @cloudflare/vite-plugin ^1.48.0; drop vite-tsconfig-paths
[ ] Step 3  custom outDir/assetsDir/assets-rewrite plugin verified by INSPECTING artifacts
[ ] Step 4  ctx grep -> is the cheap path available?
[ ] Step 4  context.cloudflare.env -> cloudflare:workers env; drop AppLoadContext + 2nd arg
[ ] Step 4  react-router-dom / useMatches / meta data / cloudflareDevProxy greps clean
[ ] Step 4  `.pathname` sites reviewed (not just `new URL(request.url)`); helpers take URL
[ ] Step 4  middleware callbacks that receive a raw Request handled (no normalized url there)
[ ] Step 4  .data path rules in CDN/cache/infra updated
[ ] Step 4  all four v8_* flags on, one at a time; dev log shows 0 flag warnings
[ ] Step 5  package.json FIRST, then lockfile surgery; confirm with npm ls react-router
[ ] Step 5  third-party react-router dependents bumped to their ^8 majors
[ ] Step 5  removed APIs migrated at the CALL SITE, not re-implemented locally
[ ] Post    client-only behaviour (locale switch, etc.) clicked through in a browser
[ ] Step 5  entry.server.tsx AppLoadContext -> RouterContextProvider (if custom entry)
[ ] Step 5  meta() ({ data }) -> ({ loaderData: data })
[ ] Step 5  delete future block; "type": "module" confirmed
[ ] Step 5  interim Step-4 workarounds removed now that v8 args are available
[ ] Post    typecheck at baseline parity; build green; lint clean; app exercised in dev
[ ] Post    data requests assert on PAYLOAD content per route, not just status codes
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
- **Typecheck and build are not the same detector, and neither catches
  everything.** Across two apps the three real defects each surfaced in a
  different place: a typecheck error (`Map` vs `RouterContextProvider`), a
  *client* build failure (the renamed `middleware` export), and only at runtime
  in the dev server (the locale redirect loop). Run all three at every step.
- **Being early on `unstable_` flags is a cost, not a head start.** Those apps
  pay at Step 1 instead of Step 5, and the `unstable_` → stable rename applies
  to config keys, imported APIs, *and* route module export names independently.
- **`npm ls react-router` is a step-zero command.** Every package listed under
  it is a package you will bump twice.
- Verify an upgraded package's API by reading its published files
  (`npm pack` + `tar xzf`) rather than inferring from its peer range. Peer
  ranges say what it tolerates, not which API it calls.
