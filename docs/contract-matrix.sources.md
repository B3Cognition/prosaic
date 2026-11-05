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
2. Edit the target descriptor or versioned opt-in overlay in `src/prosaic/registry.py`.
3. Run `.venv/bin/python scripts/generate_contracts.py` to regenerate the matrix
   and native-v1 golden outputs. Review the diff against the authored sources.
   Never regenerate the immutable v0.2.0 reference to hide intentional changes.
4. Version a changed contract independently of the default compatibility registry.

## Native-v1 audit (2026-11-05)

Only Claude Code and agents-md change in this overlay. The baseline registry
remains version 1.0.0; the overlay is 1.1.0-native.1 and is the fresh-project
default. Existing configuration and legacy ownership keep their prior contract.
This is not a claim that
the remaining historical adapters match current tool releases.

- [Claude skills](https://code.claude.com/docs/en/skills): project skills use
  `.claude/skills/<name>/SKILL.md` with supporting resources in that folder.
- [Claude project rules](https://code.claude.com/docs/en/memory): `.claude/rules/`
  Markdown files load automatically with project settings enabled. `paths`
  scopes a rule; without it a rule loads at launch. Recent versions support
  AGENTS.md directly, depending on version and instruction-file settings.
- [Claude subagents](https://code.claude.com/docs/en/sub-agents): project agent
  definitions remain Markdown files in `.claude/agents/`.
- [Codex AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md):
  project instruction discovery recognizes AGENTS.md, subject to override and
  configured filename/size precedence. Managed markers are Prosaic's ownership
  mechanism, not a tool-specific requirement.

Current documentation also confirms bundle skill support in
[Cursor](https://cursor.com/help/customization/skills),
[GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills),
[Codex](https://learn.chatgpt.com/docs/build-skills), and
[Gemini CLI](https://geminicli.com/docs/cli/skills/). Their descriptor refresh is
deferred; the overlay does not silently enable these capabilities. Windsurf's
former skills documentation redirected to a page unavailable during this audit,
so its current layout was not verified.
