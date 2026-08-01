# Target On-Disk Contracts

The authoritative, generated per-target contract matrix lives at
[`src/registry/adapters/contract-matrix.md`](../src/registry/adapters/contract-matrix.md),
with reference provenance in
[`contract-matrix.sources.md`](../src/registry/adapters/contract-matrix.sources.md).

Each target declares:

- **destination directory** — the one directory its outputs land in (FR-044)
- **serialization format** — Markdown, TOML, or YAML (FR-045)
- **file extension** — the primary output extension
- **argument token** — what command argument placeholders rewrite to (FR-014/FR-045)
- **frontmatter rules** — strip / passthrough / inject (FR-046)
- **capability flags** — which of {rule, skill, subagent, command} the target
  natively supports (FR-047)

Because these contracts are undocumented upstream and drift over time
(Assumption A-004), every target is pinned by a golden conformance fixture under
`conformance-fixtures/`. A drift in a tool's contract surfaces as a fixture diff
rather than a silent breakage.

## Neutral-adjacent frontmatter vocabulary

Every artifact type accepts the 7 Neutral Behavior Vocabulary keys — `execution`,
`capability`, `effort`, `tools`, `invocation`, `visibility`, `color` — each
translated per target (`translations`) and stripped from the emitted frontmatter.

`model_tier` is a permissive-string frontmatter field validated the same way as
`effort`, but it is **not** a member of the Neutral Behavior Vocabulary and is
**excluded from translation**: it is never stripped, never mapped through a
target's `translations`, and always passes through unchanged into the rendered
output. Prosaic defines no mapping from a `model_tier` value (for example
`fast`, `balanced`, `strong`, `ultra`) to a concrete model identifier — that
resolution is left to the AI-tool runtime reading the rendered file.

See [add-a-target.md](add-a-target.md) to add or update a target.
