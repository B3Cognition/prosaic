# Import a Foreign Tool's Prose

Reuses the `claude-code` fixture from `conformance-fixtures/import-foreign/`
(the same content the project's own round-trip conformance suite checks
against) plus one deliberately malformed file, to show `prosaic import`
recovering existing tool-specific content into neutral Prosaic source —
without aborting the whole run when one file can't be recovered.

Run it from inside this directory using the CLI you built locally
(`node ../../dist/cli/index.js`), or `prosaic` if you have it linked.

## 1. Import the foreign fixture

`foreign-fixture/.claude/` contains two files: `team-guardrails.md` (a
well-formed Claude Code rule) and `broken-notes.md` (frontmatter with no
closing `---` delimiter, on purpose).

```bash
node ../../dist/cli/index.js import foreign-fixture --format claude-code
```

Expected output: [`expected-output/01-import.txt`](expected-output/01-import.txt).

The run reports:
- `team-guardrails.md` recovered into `rules/team-guardrails.md` with a
  `fully-invertible` fidelity level — one fidelity level per recovered
  artifact, never an unqualified "loss-free" claim.
- `broken-notes.md` dropped with exactly one `malformed-frontmatter` warning
  naming the file and the reason. The run still completes (exit code 1
  reflects the one dropped file, but the process never crashes and the
  well-formed file is still imported) — a malformed file never aborts the
  whole import.
