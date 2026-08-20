# CLI and content operations

## Configuration and authentication

The SDK reads `edgecms.config.json` from the current working directory. Required
fields are `localesDir`, `defaultLocale`, and `typesOutputPath`. Configure
`baseUrl` directly or through `${EDGECMS_BASE_URL}`. The environment variable
`EDGECMS_BASE_URL` takes precedence. `EDGECMS_API_KEY` is required for CLI
authentication and must come from the environment.

`pull` writes `.edgecms-state.json` inside `localesDir`. Keep it with the locale
snapshot: it records the instance, default locale, and opaque catalogue revision
that a later `push` must match.

Prefer repository scripts such as `npm run edgecms:push` because they may load
the correct environment file. Run commands from the project root.

## Commands

| Command                                                                                    | Effect                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `edgecms pull [--all] [--from live\|draft]`                                                | Write locale snapshots and generated types                                |
| `edgecms push [--section name]`                                                            | Push the default locale if its pulled base is still current                |
| `edgecms check [--locale tag] [--verbose]`                                                 | Fail when translations are missing or empty                               |
| `edgecms stale [--locale tag] [--verbose]`                                                 | Fail when translations were written against an older default-locale value |
| `edgecms publish [--wait] [--timeout seconds]`                                             | Release the shared draft                                                  |
| `edgecms publish:status id`                                                                | Inspect a release                                                         |
| `edgecms languages`                                                                        | List locales and the default                                              |
| `edgecms languages:add tag [--default]`                                                    | Add a canonicalized BCP-47 locale in draft                                |
| `edgecms languages:set-default tag`                                                        | Change the default locale in draft                                        |
| `edgecms sections`                                                                         | List sections                                                             |
| `edgecms sections:add name`                                                                | Create a section                                                          |
| `edgecms sections:assign-keys section keys...`                                             | Assign existing i18n keys to an existing section                          |
| `edgecms sections:assign-media section media-ids...`                                       | Assign existing media revisions to an existing section                    |
| `edgecms sections:rename name new-name`                                                    | Rename a section and refile its content                                   |
| `edgecms sections:delete name [--yes]`                                                     | Delete a section and leave its content unsorted; dry run by default       |
| `edgecms prune [--verbose] [--yes]`                                                        | Compare default-locale keys and optionally delete orphans from draft      |
| `edgecms keys:delete keys... [--yes]`                                                      | Explicitly delete named keys from draft                                   |
| `edgecms blocks:push [file]`                                                               | Add declared schemas, properties, and collections                         |
| `edgecms schemas`                                                                          | List block schemas                                                        |
| `edgecms blocks`                                                                           | List collections and item counts                                          |
| `edgecms import-blocks file collection [--locale tag]`                                     | Bulk-import block instances into draft                                    |
| `edgecms media [--search text] [--section name] [--state live\|archived] [--all-versions]` | List and search media revisions                                           |
| `edgecms media:upload file [--section name]`                                               | Upload live media and print its ID and canonical URL                      |
| `edgecms media:replace id file`                                                            | Replace media under its existing canonical URL                            |
| `edgecms blocks:set-media collection instance property media-id`                           | Attach media to a block property in draft                                 |

Check the installed SDK's `edgecms --help` before using commands absent from an
older project version.

## Push safety

Push requires the state created by `pull`. The API rejects a missing revision
and returns `CATALOGUE_CONFLICT` without writing when the default-locale
catalogue has changed since that pull. This detects editor and CLI changes made
within the same draft version; a draft version ID alone does not.

On a conflict, preserve local edits before pulling the draft because pull
replaces the local locale file. Reconcile the newer CMS values with those edits,
then push from the new base. A successful push advances the local state file;
commit it with the locale snapshot.

Upgrade the EdgeCMS instance and SDK together. An updated instance rejects older
SDKs that omit the base revision, while an updated SDK refuses an older instance
that does not return one. After upgrading, preserve pending local edits, pull the
draft, reconcile them, and commit the generated state before the next push.

## Deletion safety

`prune`, `keys:delete`, and `sections:delete` are dry runs unless `--yes` is
supplied. Key deletion refuses to delete block-owned translation keys, and prune
aborts on an empty local catalogue. Prune compares the CMS draft against the
default locale only; it cannot find keys that exist solely in a non-default
locale. In a shared CMS, prune from the application that owns the relevant
keyspace.

Translation-key deletions affect draft first and become live only after
publication. Still treat `--yes` as destructive and verify every target.

Sections are structural rather than versioned. Creating and renaming them takes
effect immediately. Deleting one immediately leaves associated translations,
media, and block collections unsorted without deleting that content. Assignments
require the target section and every requested key or media ID to exist. A
request assigns nothing if validation finds any missing resource.

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

Media has a separate lifecycle: uploads are live immediately, replacement
archives the selected revision and creates a new live revision, and the
canonical URL remains stable. Block properties store a revision ID but resolve
through that canonical URL, so replacement does not break existing references.

## New-instance order

Create languages first because push and block import reject unknown locales.
Then apply block schemas, push translations, import content, check translation
coverage, and publish with `--wait` when authorized.
