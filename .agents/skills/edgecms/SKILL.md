---
name: edgecms
description:
  Install, upgrade, manage, and integrate EdgeCMS instances, translations,
  languages, releases, typed locale snapshots, blocks, schemas, media, D1
  migrations, CI pipelines, public HTTP endpoints, Cloudflare Worker service
  bindings, custom routes, and admin extensions. Use when a task mentions
  deploying EdgeCMS to Cloudflare, synchronizing an instance repository with
  upstream, repairing unrelated or squashed Git history, resolving upstream and
  extension migration-number collisions, adding EdgeCMS to GitHub Actions or CI,
  building project-specific pages under /edge-cms/custom, editing
  app/extension.ts, edgecms.config.json, @upbeat-works/edgecms-sdk, edgecms
  push/pull/publish/check/stale/prune, generated translation types, stale
  translations, AI translation scope, CMS-managed locales or blocks, or keeping
  application content synchronized with an EdgeCMS instance.
---

# EdgeCMS

Treat EdgeCMS as the content authority and the configured default locale as the
only locale authored in the application repository.

## Discover the project contract

Before editing content:

1. Read `edgecms.config.json` and identify `defaultLocale`, `localesDir`,
   `typesOutputPath`, `baseUrl`, and optional `blocksFile`.
2. Read the package scripts and use their EdgeCMS wrappers when present; they
   often load credentials from a project-specific env file.
3. Read the repository's EdgeCMS/i18n documentation and tests. Preserve its
   runtime fallback and synchronization model.
4. Inspect the installed SDK version or the matching EdgeCMS source before
   assuming a command or API is available.
5. Never print API keys or environment-file contents.

For translation work, read [translations.md](references/translations.md). For
CLI operations, safety rules, blocks, and languages, read
[cli.md](references/cli.md). For application integration, read
[integration.md](references/integration.md). For deploying or upgrading an
EdgeCMS instance, read [instances.md](references/instances.md). For GitHub
Actions and other CI pipelines, read [ci.md](references/ci.md). For custom admin
routes and the extension API, read
[custom-routes.md](references/custom-routes.md). For D1 migrations and numbering
collisions, read [migrations.md](references/migrations.md).

## Apply the translation workflow

For copy edits and new keys:

1. Edit only the locale file named by `defaultLocale`.
2. Add or update tests for user-visible behavior when warranted; do not add a
   test that merely freezes wording.
3. Run the project's push script. A push changes the CMS draft, never live
   content.
4. Have translations completed in EdgeCMS and publish only when the user has
   authorized making the draft live.
5. Pull all locales after publication when the project keeps locale snapshots.
   Pull regenerates translation types.
6. Run the translation check, typecheck, and relevant tests.

Editing an existing default-locale value marks the other locales' translations
of that key stale — they still exist, so `check` stays silent, and
`edgecms stale` is what reports them. Report stale keys after a push rather than
resolving them silently: rewriting them is a content decision, and the AI
translation scope that covers them overwrites existing text.

Never manually edit non-default locale snapshots or generated type files. Do not
pull live immediately after pushing an unpublished draft: doing so can replace
the local default-locale changes with the older live version. Use a draft pull
only when the task explicitly needs draft state.

## Respect state boundaries

- Treat `pull`, list operations, checks, and dry runs as read/synchronization
  operations, while noting that pull writes generated local files.
- Treat `push`, block imports, schema application, language changes, section
  changes, key deletion, publish, and rollback as external mutations.
- Treat AI translation over untranslated _and outdated_ keys as destructive: it
  replaces existing translations, hand-written ones included. Let the user pick
  the scope; never widen it for them.
- Treat publishing as a production-visible action. Obtain clear authorization
  unless the user explicitly requested publication.
- Run `prune` and `keys:delete` without `--yes` first. Review exact targets
  before requesting or performing deletion.
- Preserve unrelated draft work. A release publishes the current shared draft,
  not merely the keys changed in the current task.

## Keep knowledge current

Prefer the checked-out EdgeCMS repository and installed SDK over this skill when
behavior differs. Useful sources are the EdgeCMS README, SDK CLI and
configuration modules, Worker RPC entrypoint, and extension documentation.
Update this skill when a verified product change makes these instructions stale.
