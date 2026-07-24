# Multi-Repository: Company-Managed Prose Source

Two real, nested directories model the "company source repository" +
"consuming application repository" split the root README's
"Company-Managed Prose Repository" section describes:

- `company-source/.prosaic/` — the shared source-of-truth tree a company
  would maintain centrally.
- `consuming-app/prosaic.config.yaml` — a product repository that points its
  `source:` key at the sibling directory (`../company-source/.prosaic`) and
  distributes it to its own targets.

Both directories are real and runnable, nested inside this one Example
directory so the whole thing stays self-contained (FR-002) — the only
illustrative part is *how the bytes would get from one real repository onto
another* in production, which is prose-only below.

Run it from inside `consuming-app/` using the CLI you built locally
(`node ../../../dist/cli/index.js`), or `prosaic` if you have it linked.

## 1. Apply the consuming app's config

```bash
cd consuming-app
node ../../../dist/cli/index.js apply --dry-run
```

Expected output: [`expected-output/01-consuming-app-apply.txt`](expected-output/01-consuming-app-apply.txt).
`consuming-app` never has its own `.prosaic/` tree — every file it would
generate comes from resolving `source: ../company-source/.prosaic`.

## Delivery mechanism (illustrative only — not run by this example)

In a real company-managed setup, `company-source/.prosaic` would not sit
next to `consuming-app/` in the same repository; it would live in a
separate repository, delivered into each consuming repository by one of:

- **Illustrative step:** Git submodule or subtree — keep the company prose
  repository checked out under `vendor/` or `tools/` in each consuming repo,
  then point `source:` at it.
- **Illustrative step:** CI checkout — a workflow checks out both the
  product repo and the prose repo, then runs
  `prosaic apply --source ../company-ai-prose/.prosaic`.
- **Illustrative step:** Package or artifact sync — publish the `.prosaic/`
  directory as an internal package or build artifact, unpack it into the
  product repo, then run Prosaic.
- **Illustrative step:** Monorepo shared directory — keep one shared
  `.prosaic/` tree at the monorepo root and run Prosaic from each package
  with `--source ../../.prosaic` or an equivalent config value.

None of these four steps is a manifest step in `example.manifest.json` — they
describe how the *real* two-repository split would be wired up outside of
this self-contained, offline demonstration.
