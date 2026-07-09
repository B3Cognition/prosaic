# Target Adapter Descriptors

Each file in this directory is a **cluster** of declarative target adapter
descriptors (FR-006). A descriptor is pure data — the core transformation
pipeline is parameterized by it, so a new target is added by editing data here,
never by changing core logic (FR-008).

## Clusters

| Directory | Format | Examples |
| --- | --- | --- |
| `markdown-frontmatter/` | Markdown + YAML | Claude Code, Cursor, Windsurf, Cline |
| `toml-command/` | TOML | Codex CLI, Gemini CLI |
| `yaml-recipe/` | YAML | Goose |
| `companion-file/` | Markdown + sidecar | GitHub Copilot |
| `markdown-longtail/` | Markdown + YAML | the remaining parity-baseline targets |

`index.ts` aggregates every cluster into `ALL_DESCRIPTORS` (the built-in
registry). `contract-matrix.md` is the generated audit of every target's on-disk
contract (OQ-001); `contract-matrix.sources.md` records its provenance.

Use the `adapter()` helper (`build.ts`) to write a descriptor as a compact
literal. See [`docs/add-a-target.md`](../../../docs/add-a-target.md) for the full
authoring + conformance flow.
