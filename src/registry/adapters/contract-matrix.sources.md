# Contract Matrix — Reference Provenance (T-043)

> Provenance notes for the OQ-001 per-target on-disk contract matrix
> (`contract-matrix.md`). Each target's contract — destination directory,
> serialization format, file extension, argument token, frontmatter rules, and
> native-support capability flags — is derived from the reference sources below.
> Because target contracts are undocumented and drift over time (Assumption
> A-004), the matrix is pinned per registry release (NFR-011) and every target is
> guarded by a conformance fixture (FR-009) so a silent upstream change is caught.

## Reference sources

- **Ruler** (`@intellectronica/ruler`) — `src/agents/constants.ts` and each
  `*Agent.ts` adapter, which encode the destination directory and file layout per
  tool. Pinned reference: `ruler@0.4.0` (see `registry/version.ts`).
- **Spec-kit distribution registrar** — the per-tool command/skill/agent slot
  configuration used to route one authored artifact into a tool's native slot.
- **First-party tool documentation** — each tool's own docs for its rules /
  commands / skills directory contract (e.g. Claude Code `.claude/{commands,skills,agents}`,
  Cursor `.cursor/rules/*.mdc`, Codex `.codex/prompts/*.toml`, Goose recipe YAML,
  GitHub Copilot `.github/{instructions,prompts}` companion layout).

## Per-cluster provenance

| Cluster | Basis | Notes |
| --- | --- | --- |
| markdown-frontmatter | Ruler adapters + tool docs | Highest-reach tools; Markdown-with-YAML frontmatter. |
| toml-command | Codex CLI + Gemini CLI docs | Command contract requires TOML; body → `prompt`. |
| yaml-recipe | Goose recipe schema | Whole-file YAML; body → `instructions`, `version` injected. |
| companion-file | GitHub Copilot prompt-file layout | Primary output plus a sidecar companion (FR-022). |
| markdown-longtail | Ruler agent list | Remaining Markdown targets to reach the ≥35 parity baseline (NFR-008). |

## Update procedure

1. Confirm the tool's current on-disk contract against its docs / the pinned
   Ruler reference.
2. Edit the target's descriptor in `src/registry/adapters/<cluster>/index.ts`.
3. Regenerate `contract-matrix.md` and the golden conformance fixtures
   (`UPDATE_FIXTURES=1 npm test`), then review the fixture diff before committing.
4. Bump `registry/version.ts` when a contract changes (NFR-011).
