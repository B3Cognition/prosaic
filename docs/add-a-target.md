# Adding a Target

Prosaic distributes to a target through a **declarative adapter descriptor** plus
a **conformance fixture**. Adding coverage is a data edit — no changes to core
transformation logic (FR-008, Constitution Principle II).

## 1. Add the descriptor

Pick the cluster that matches the target's serialization contract and add one
entry to its `index.ts`:

- `src/registry/adapters/markdown-frontmatter/` — Markdown-with-YAML tools
- `src/registry/adapters/toml-command/` — TOML command tools
- `src/registry/adapters/yaml-recipe/` — YAML recipe tools
- `src/registry/adapters/companion-file/` — tools needing a sidecar companion
- `src/registry/adapters/markdown-longtail/` — additional Markdown tools

Use the `adapter()` helper:

```ts
adapter({
  id: 'my-tool',
  label: 'My Tool',
  dir: '.mytool/rules',              // one destination directory (FR-044)
  format: 'markdown',               // one serialization format (FR-045)
  extension: '.md',
  argumentToken: '$ARGUMENTS',      // one argument token (FR-045)
  caps: { rule: true, command: true }, // native support per artifact type (FR-047)
  slots: { command: { dir: '.mytool/commands', extension: '.md' } }, // routing (FR-023)
  strip: [], passthrough: '*', inject: {}, // three frontmatter categories (FR-046)
})
```

Every descriptor field maps to a requirement:

| Field | Requirement |
| --- | --- |
| `dir` | exactly one destination directory (FR-044) |
| `format` + `argumentToken` | one serialization format + one argument token (FR-045) |
| `strip` / `passthrough` / `inject` | the three frontmatter rule categories (FR-046) |
| `caps` | a native-support capability flag per artifact type (FR-047) |
| `slots` | per-deployment-type native slot routing (FR-023) |
| `translations` | neutral-vocabulary → concrete frontmatter (FR-015) |
| `companions` | companion files written alongside the primary (FR-022) |

## 2. Pin a conformance fixture

Generate the golden on-disk output and commit it:

```bash
UPDATE_FIXTURES=1 npm test -- tests/conformance/conformance.test.ts
```

This renders the representative artifacts for your target and writes goldens under
`conformance-fixtures/<cluster>/<id>/`. Review the diff — the golden is the exact
bytes the tool will receive.

## 3. Verify

```bash
npm test
```

A target is **conformance-verified** only when its pinning test passes (FR-009,
NFR-004). The parity gate asserts at least 35 conformance-verified targets
(NFR-008). No core module changes; the registry grew as data.

## `model_tier` requires no translation rule

`model_tier` is a permissive-string frontmatter field, deliberately excluded
from the Neutral Behavior Vocabulary (see
[target-contracts.md](target-contracts.md#neutral-adjacent-frontmatter-vocabulary)).
It passes through unchanged into every target's rendered output, so a new
target's descriptor needs no `translations` entry for it and no `strip` rule to
suppress it.

## Update the matrix

Regenerate `src/registry/adapters/contract-matrix.md` (a target row is required)
and bump `src/registry/version.ts` if you changed an existing contract (NFR-011).
