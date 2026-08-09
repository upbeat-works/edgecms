# CI integration

## Contents

- [Choose the CI contract](#choose-the-ci-contract)
- [Place the pull correctly](#place-the-pull-correctly)
- [Manage credentials safely](#manage-credentials-safely)
- [Keep validation read-only](#keep-validation-read-only)
- [Avoid nondeterministic surprises](#avoid-nondeterministic-surprises)
- [Reference GitHub Actions pattern](#reference-github-actions-pattern)

## Choose the CI contract

Decide whether CI builds from committed locale snapshots or the latest published
EdgeCMS content:

- **Pull live content in CI** when previews and deployments must include the
  latest publication without waiting for a repository snapshot commit.
- **Build committed snapshots** when reproducibility and forked-PR coverage are
  more important than immediate CMS updates.
- **Use both deliberately** by pulling when credentials are available and
  falling back to committed snapshots only when the repository explicitly treats
  them as a supported runtime/build fallback. Make the fallback visible in logs;
  do not silently turn an authentication outage into a stale build.

Inspect `edgecms.config.json`, package scripts, supported locales, generated
types, and the installed SDK version before choosing `pull` or `pull --all`.
Older projects may intentionally pull only the default locale. Applications that
bundle every locale for fallback generally need `--all`.

## Place the pull correctly

In every clean CI job that consumes locale files or generated translation types:

1. Check out the repository.
2. Set up the project's supported Node version.
3. Install dependencies from the lockfile.
4. Pull published EdgeCMS content.
5. Run type generation/typecheck, tests, or the build.

GitHub Actions jobs have isolated filesystems unless artifacts or caches are
explicitly shared. A pull in the typecheck job does not update the deploy job.
Repeat it in each independent job that needs the generated files, including PR
preview builds and staging/production builds.

Use the project-installed CLI so CI executes the lockfile version:

```yaml
- name: Pull locales
  run: npx --no-install edgecms pull
  env:
    EDGECMS_API_KEY: ${{ secrets.EDGECMS_API_KEY }}
```

Use `pull --all` when the application requires every locale snapshot. Supply
`EDGECMS_BASE_URL` as a GitHub variable or job environment value when
`edgecms.config.json` references it; a fixed config URL needs no extra CI
variable.

Repository scripts are preferable when they are CI-safe. Do not invoke a local
wrapper that assumes `.env` or `.dev.vars` exists on the runner. Either add a
dedicated CI-safe script or call the lockfile-installed binary directly with
GitHub-provided environment variables.

## Manage credentials safely

- Store `EDGECMS_API_KEY` as a repository or environment secret, never a plain
  Actions variable or committed file.
- Scope secrets and environments to the jobs and branches that need them.
- Never print environment files, API keys, or authenticated responses.
- Standard `pull_request` workflows from forks do not receive repository
  secrets. Choose an explicit policy: build committed snapshots without the
  pull, skip the credential-dependent preview with a clear status, or require a
  trusted maintainer workflow.
- Do not solve fork access with `pull_request_target` while checking out and
  executing untrusted contributor code. That can expose repository secrets.

## Keep validation read-only

Ordinary lint, typecheck, test, preview, and deployment-build jobs may pull
published content and run `edgecms check`. They must not push, publish, import
blocks, change languages/schemas, prune with `--yes`, or delete keys.

Treat a workflow that mutates EdgeCMS as a separate release/operations workflow
with protected environments, narrow permissions, concurrency control, an
explicit trigger, and human approval where appropriate. Remember that publishing
releases the whole shared draft.

Run `edgecms check` when translation completeness is a release requirement. It
exits non-zero for missing or empty non-default translations. Check the
installed SDK before expecting draft selection: current `check` operates on the
server state exposed by that SDK and does not accept `--from`.

Run `edgecms stale` when translation freshness is also a release requirement. It
exits non-zero for translations written against a default-locale value that has
since changed — keys `check` considers complete. Add it as a separate gate
rather than assuming `check` covers it; a repository that edits source copy
frequently may want it as a warning step instead of a blocking one.

## Avoid nondeterministic surprises

Pulling live content means the same Git commit can build differently after an
editor publishes. Mitigate this intentionally:

- Pull once per job before all content-dependent validation.
- Do not publish concurrently from the same validation workflow.
- Use workflow concurrency controls for previews/deployments where appropriate.
- Review whether generated locale/type changes should fail a drift check, become
  a committed synchronization change, or remain ephemeral build input.
- Keep committed snapshots current when they are the runtime or fork-PR
  fallback.

## Reference GitHub Actions pattern

```yaml
jobs:
  typecheck:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Pull published locales
        run: npx --no-install edgecms pull --all
        env:
          EDGECMS_API_KEY: ${{ secrets.EDGECMS_API_KEY }}
          EDGECMS_BASE_URL: ${{ vars.EDGECMS_BASE_URL }}
      - run: npm run typecheck
      - run: npm test
```

Adapt the command and secret availability to the repository rather than copying
this example blindly. Deployment jobs need their own pull after their own
dependency installation unless generated files are deliberately passed as an
artifact from a trusted upstream job.
