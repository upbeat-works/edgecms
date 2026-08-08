# CLI and content operations

## Configuration and authentication

The SDK reads `edgecms.config.json` from the current working directory.
Required fields are `localesDir`, `defaultLocale`, and `typesOutputPath`.
Configure `baseUrl` directly or through `${EDGECMS_BASE_URL}`. The environment
variable `EDGECMS_BASE_URL` takes precedence. `EDGECMS_API_KEY` is required for
CLI authentication and must come from the environment.

Prefer repository scripts such as `npm run edgecms:push` because they may load
the correct environment file. Run commands from the project root.

## Commands

| Command | Effect |
| --- | --- |
| `edgecms pull [--all] [--from live|draft]` | Write locale snapshots and generated types |
| `edgecms push [--section name]` | Push the default locale into the draft |
| `edgecms check [--locale tag] [--verbose]` | Fail when translations are missing or empty |
| `edgecms publish [--wait] [--timeout seconds]` | Release the shared draft |
| `edgecms publish:status id` | Inspect a release |
| `edgecms languages` | List locales and the default |
| `edgecms languages:add tag [--default]` | Add a canonicalized BCP-47 locale in draft |
| `edgecms languages:set-default tag` | Change the default locale in draft |
| `edgecms prune [--verbose] [--yes]` | Compare default-locale keys and optionally delete orphans from draft |
| `edgecms keys:delete keys... [--yes]` | Explicitly delete named keys from draft |
| `edgecms blocks:push [file]` | Add declared schemas, properties, and collections |
| `edgecms schemas` | List block schemas |
| `edgecms blocks` | List collections and item counts |
| `edgecms import-blocks file collection [--locale tag]` | Bulk-import block instances into draft |

Check the installed SDK's `edgecms --help` before using commands absent from an
older project version.

## Deletion safety

`prune` and `keys:delete` are dry runs unless `--yes` is supplied. They refuse
to delete block-owned translation keys, and prune aborts on an empty local
catalogue. Prune compares the CMS draft against the default locale only; it
cannot find keys that exist solely in a non-default locale. In a shared CMS,
prune from the application that owns the relevant keyspace.

Deletions affect draft first and become live only after publication. Still
treat `--yes` as destructive and verify every target.

## Block schemas

The default declarative file is `blocks.schema.json`; `blocksFile` may override
it. Schema names are kebab-case and property names camelCase. Property forms
support a type and optional description; `block` and `collection` references
require `refSchema`.

`blocks:push` is additive and idempotent. It creates missing structures and
updates non-structural descriptions/sections, but never deletes or retypes a
property or rebinds a collection. Conflicting structure fails rather than
orphaning stored content. New block instances and changes remain draft until
published.

## New-instance order

Create languages first because push and block import reject unknown locales.
Then apply block schemas, push translations, import content, check translation
coverage, and publish with `--wait` when authorized.
