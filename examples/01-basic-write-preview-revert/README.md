# Basic Write, Preview, and Revert

A minimal, self-contained Prosaic project: one rule, one command, two
targets (`claude-code`, `cursor`). Run it to see the full write/revert
lifecycle — preview, write, safe re-run, and what happens when you try to
revert a project that was never written.

This example mirrors the root README's "First Run" walkthrough so the two
stay consistent; run it from inside this directory using the CLI you built
locally (`node ../../dist/cli/index.js`), or `prosaic` if you have it linked.

## 1. Preview the write plan

```bash
node ../../dist/cli/index.js apply --dry-run
```

Expected output: [`expected-output/01-preview.txt`](expected-output/01-preview.txt).
No files are written by a dry run.

## 2. Write the generated files

```bash
node ../../dist/cli/index.js apply
```

Expected output: [`expected-output/02-apply.txt`](expected-output/02-apply.txt).

## 3. Re-run safely

Run `apply` again with no source changes:

```bash
node ../../dist/cli/index.js apply
```

Expected output: [`expected-output/03-reapply-noop.txt`](expected-output/03-reapply-noop.txt).
Prosaic makes no-op re-applies byte-identical, so this reports zero changed
files.

## 4. Revert without a prior write

This step is the example's non-happy path: run `revert` against a fresh
copy of this project that has never been applied, so no
`.prosaic-manifest.json` exists yet.

```bash
node ../../dist/cli/index.js revert
```

Expected output: [`expected-output/04-revert-refused.txt`](expected-output/04-revert-refused.txt).
Prosaic refuses with a non-zero exit code — it never guesses which files it
would be allowed to delete.
