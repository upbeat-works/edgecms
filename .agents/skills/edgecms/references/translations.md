# Translation synchronization

## Ownership model

- `edgecms.config.json.defaultLocale` determines the sole locally authored
  locale. Do not infer it from filenames.
- `edgecms push` reads only that default-locale JSON file and updates the draft.
- Translate non-default locales in EdgeCMS. Local copies are generated
  snapshots, commonly committed for synchronous startup and offline/runtime
  fallback.
- `edgecms pull` writes locale JSON and regenerates the configured TypeScript
  output. Never hand-edit generated types.
- With strict i18next key checking, wire the generated key type through module
  augmentation and run the project typecheck after pulling.

## Safe round trip

```text
edit default locale -> push -> translate/review draft -> publish -> pull --all
-> translation check -> typecheck/tests -> review diff
```

Push is additive: removing a local key does not delete it remotely. Use the
prune workflow for removals.

## Draft versus live

- `edgecms pull` defaults to the live default locale.
- `edgecms pull --all` pulls every live locale.
- `edgecms pull --from draft` reads draft content.
- Public endpoints and live Worker RPC reads serve the published snapshot.
- A push, language change, block import, schema push, or deletion remains in
  draft until published.

After a push, do not pull live before publication unless intentionally
discarding/reconciling the local edit. If a task stops at a draft, report that
publication and the final pull remain outstanding.

## Validation

Use `edgecms check` as the translation-completeness gate. It reports keys
present in the default locale but missing or empty in non-default locales and
exits non-zero when gaps exist. Use `--locale` to target one locale and
`--verbose` for the complete list.

Tests should protect real outcomes: valid keys, matching interpolation
placeholders, safe fallback behavior, and important claims across supported
languages. Avoid tests whose only purpose is to lock exact prose.
