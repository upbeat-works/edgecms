# Instance installation and upgrades

## Deploy a new instance

The normal installation path is the **Deploy to Cloudflare** button in the
upstream EdgeCMS GitHub README:

1. Open the canonical EdgeCMS repository README and select **Deploy to
   Cloudflare**.
2. Authenticate with Cloudflare and provide the requested instance details.
3. Confirm deployment. Cloudflare provisions and publishes the instance, then
   creates a new GitHub repository for that deployment.
4. Configure the required Cloudflare secrets for session handling,
   authentication, and `LEGAL_SIGNING_PRIVATE_JWK`. The legal signing secret is
   required for the app to build and run.
5. Optionally configure an OpenAI API key to enable AI-assisted translations.
6. Verify authentication, the admin UI, and a public endpoint before treating
   the instance as live.

Discover the exact secret names from the deployed EdgeCMS version's README,
configuration types, and environment validation. Never guess secret names, print
secret values, commit them, or replace a production secret without clear
authorization.

## Understand the two repository shapes

Older deployments retain upstream Git ancestry. Add the canonical EdgeCMS
repository as `upstream`, fetch it, merge or rebase its changes, resolve any
instance-specific conflicts, test, and push. The connected history lets Git
identify the merge base normally.

Newer Deploy-to-Cloudflare repositories may squash the upstream template into a
new initialization commit. Although the files originated upstream, the two
repositories then have unrelated histories. Do not repeatedly use
`--allow-unrelated-histories`: it produces noisy conflicts and prevents Git from
understanding which changes belong to upstream versus the instance.

## Reparent a squashed deployment once

Reparenting rewrites history. Never perform it merely because a pull conflicts.
First prove the instance has no common merge base with upstream and that its
root is a Cloudflare-generated squash of an identifiable upstream revision.

1. Require a clean worktree and fetch both `origin` and the canonical `upstream`
   remote.
2. Record the current branch, root commit, remotes, and deployment-specific
   commits. Create a local backup branch and ensure the remote repository is
   recoverable.
3. Identify the upstream revision used by the deployment. Compare trees and
   deployment metadata; do not assume current `upstream/main` was the original
   template revision.
4. Calculate and review the instance-specific delta: Cloudflare resource IDs,
   Worker name, URLs, bindings, extensions, and all commits made after initial
   deployment. Do not mistake upstream changes since deployment for local
   deletions.
5. Rebuild the instance branch on the identified upstream revision and reapply
   only that reviewed instance delta. Preserve meaningful post-deployment
   commits when practical; otherwise document the consolidation in the rewritten
   commit history.
6. Merge the current `upstream/main`, resolve genuine conflicts, and run the
   repository's complete verification suite.
7. Compare the rebuilt tree with the backup, paying special attention to
   Wrangler configuration, D1/R2 bindings, workflows, auth/session setup,
   extensions, migrations, and package metadata.
8. Replace the remote branch only with explicit authorization for the history
   rewrite. Coordinate first when other clones or collaborators exist.
9. Confirm the Cloudflare-connected repository redeploys successfully.

Do not encode commit IDs into reusable instructions. The correct upstream base
is instance-specific. Prefer an auditable backup-and-rebuild procedure over
opaque graft/filter commands unless the exact repository has been inspected and
the operator understands how replacement refs become permanent.

After this one-time repair, `git merge-base main upstream/main` should return a
commit. Future upgrades return to the ordinary upstream fetch/merge workflow.

## Routine upgrades after reparenting

1. Start from a clean, backed-up instance branch.
2. Fetch `upstream` and inspect its release notes, migrations, SDK changes, and
   deployment configuration changes.
3. Merge upstream into the instance branch and resolve conflicts without
   discarding instance resource identifiers, secrets configuration, bindings, or
   extensions.
4. Reconcile D1 migrations using [migrations.md](migrations.md) before applying
   anything, then regenerate platform types when the upstream release requires
   it.
5. Run types, tests, build, and any local Worker smoke checks.
6. Push only when authorized; the GitHub/Cloudflare integration redeploys the
   instance from that push.
7. Verify the deployment, authentication, admin pages, public content, media,
   service bindings, and publication workflow.

Treat upstream merges, migration application, force-pushes, secret changes, and
production deployments as distinct actions with their own authorization and
rollback considerations.
