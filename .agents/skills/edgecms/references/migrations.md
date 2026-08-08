# D1 migration coordination

EdgeCMS core and instance extensions share one D1 database and, by default, one
flat `migrations/` namespace. Both branches can independently create the same
numeric filename. Treat this as a database-ledger problem, not just a Git
conflict.

Cloudflare D1 records applied migrations by filename in `d1_migrations` (or the
configured `migrations_table`). Wrangler discovers files from `migrations_dir`
and optional `migrations_pattern`, lists unapplied files, and applies them in
sequence. See the current [Cloudflare D1 migration
documentation](https://developers.cloudflare.com/d1/reference/migrations/).

## Before merging migrations

1. Require a clean worktree and retain the pre-merge refs.
2. List migration files on the instance branch and incoming upstream branch.
3. Compare same-named files byte-for-byte. Identical SQL is not a collision;
   different SQL is.
4. Inspect migration state for every relevant database: local, preview,
   staging, and production. Use the project-pinned Wrangler and the correct
   binding/database and environment. `wrangler d1 migrations list` reports
   unapplied files; inspect the configured migration ledger when needed.
5. Determine which colliding filename, if either, has already been applied in
   each environment. Do not infer production state from Git history or a local
   database.

Never apply migrations while the collision is unresolved.

## Resolve the normal collision

When the instance migration is already applied and the incoming upstream
migration is not, preserve the applied instance filename and renumber the
incoming upstream file to the next unused number in the instance repository.
Do not change its SQL merely because its filename changes.

For example:

```text
instance 0019_add_extension_mappings.sql  (already applied)
upstream 0019_add_core_api_key_reference.sql (incoming)

resolved instance history:
0019_add_extension_mappings.sql
0020_add_core_api_key_reference.sql
```

Record the renaming in the merge/upgrade description so a later upstream merge
recognizes that the instance's `0020` corresponds to upstream's `0019`.

When neither migration has been applied anywhere, order them by actual schema
dependency and assign unique numbers before the first application. Prefer
preserving the upstream filename and renumbering the extension migration when
that does not conflict with an existing instance history.

## Never rename an applied migration casually

Renaming an applied file changes the name Wrangler compares with the ledger.
It can therefore appear unapplied and execute twice. Never edit or replace the
SQL content of a migration recorded as applied. Correct mistakes with a new
forward migration.

If different environments already applied different SQL under the same
filename, stop automation. Back up each database, compare actual schemas and
ledger rows, design an environment-specific reconciliation, and test it on
copies. The repair may require forward migrations plus a carefully audited
ledger correction; it cannot be solved safely by choosing one Git file. Obtain
explicit authorization before changing a remote migration ledger or schema.

## Handle later upstream migrations

Renumbering one upstream migration in an instance can make later upstream
numbers collide again. On every upstream merge:

- Compare by migration purpose/content, not number alone.
- Preserve every filename already applied to an instance environment.
- Renumber only incoming, unapplied files into unused instance numbers.
- Maintain upstream order and schema dependencies among the renumbered files.
- Check for code that assumes an upstream schema change before its renumbered
  migration runs.

Do not use a second migrations directory or change `migrations_pattern` as an
ad hoc collision fix in an established instance. D1 records paths relative to
`migrations_dir`; changing discovery paths can make old migrations appear new.
A namespaced layout may be designed for a new installation, but its global
ordering and ledger names must be defined before any environment applies it.

## Verify and release

1. Apply the complete sequence to a fresh local D1 database.
2. Apply it to a copy representing the latest production schema when practical.
3. Run integration tests that exercise both EdgeCMS core and extension tables.
4. List unapplied migrations for each target environment and review the exact
   plan before remote application.
5. Apply migrations separately from Worker deployment when the project supports
   that boundary. Cloudflare captures a backup before `migrations apply`, but
   still treat remote schema changes as production mutations.
6. Verify the migration ledger, resulting schema, core CMS flows, and extension
   flows before deploying code that depends on the new schema.
