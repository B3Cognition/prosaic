# Multi-Artifact-Type

A source-of-truth directory with one artifact of every type Prosaic
recognizes — `rule`, `command`, `skill`, `subagent` — distributed to two
targets with different capabilities: `claude-code` (supports all four) and
`cursor` (supports only `rule` and `command`).

Run it from inside this directory using the CLI you built locally
(`node ../../dist/cli/index.js`), or `prosaic` if you have it linked.

## 1. Apply to `claude-code`

`claude-code` supports every artifact type, so all four are written.

```bash
node ../../dist/cli/index.js apply --targets claude-code --dry-run
```

Expected output: [`expected-output/01-apply.txt`](expected-output/01-apply.txt).

## 2. Apply to `cursor`

`cursor` only supports `rule` and `command`. Rather than silently dropping
the `skill` and `subagent` artifacts, Prosaic surfaces one capability-gating
warning per unsupported artifact.

```bash
node ../../dist/cli/index.js apply --targets cursor --dry-run
```

Expected output: [`expected-output/02-capability-gating-warning.txt`](expected-output/02-capability-gating-warning.txt).
