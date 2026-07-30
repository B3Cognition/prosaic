# Resolve Execution Settings for an Orchestrator

`prosaic resolve` returns the model, reasoning effort, tools, and execution
type Prosaic would use for a given artifact/target pair, as structured JSON —
for an external runtime orchestrator that wants to invoke the right AI coding
tool without parsing generated provider files. Reuses the same `rules/style.md`
rule and `claude-code` target the root README's own resolve walkthrough
documents.

Run it from inside this directory using the CLI you built locally
(`node ../../dist/cli/index.js`), or `prosaic` if you have it linked.

## 1. Resolve a registered artifact/target pair

```bash
node ../../dist/cli/index.js resolve rules/style.md --target claude-code
```

Expected output: [`expected-output/01-resolve.txt`](expected-output/01-resolve.txt).
The response always has all four documented fields — `model`,
`reasoningEffort`, `tools`, `executionType` — each reporting `status:
"resolved"` or `status: "unresolved"`; a property is marked `unresolved`
rather than omitted when the target has no translation rule for it, so zero
documented fields are ever missing from the result.

## 2. Resolve against an unregistered target

```bash
node ../../dist/cli/index.js resolve rules/style.md --target no-such-target
```

Expected output: [`expected-output/02-unregistered-target.txt`](expected-output/02-unregistered-target.txt).
An unregistered `--target` produces exactly one documented error on stderr
and a non-zero exit code — Prosaic never guesses at a fallback target.
