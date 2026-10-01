# Prosaic Target Contract Matrix (OQ-001)

> Extracted per-target on-disk contract for every registered target (T-043). This is the audited source the declarative adapter descriptors are populated from (FR-006, FR-044–FR-047). Generated from the registry so the matrix and descriptors cannot drift.

**Registry version:** 1.0.0 · **Ruler-parity ref:** ruler@0.4.0 · **Parity baseline:** 35 · **Targets:** 40

| id | label | destination dir | format | ext | arg token | capabilities |
| --- | --- | --- | --- | --- | --- | --- |
| agents-md | AGENTS.md (generic) | `.` | markdown | `.md` | `$ARGUMENTS` | rule |
| aide | Aide | `.aide/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| aider | Aider | `.aider/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| amazon-q | Amazon Q Developer | `.amazonq/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| antigravity | Antigravity | `.antigravity/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| augmentcode | Augment Code | `.augment/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| bolt | Bolt | `.bolt/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| claude-code | Claude Code | `.claude` | markdown | `.md` | `$ARGUMENTS` | rule+skill+subagent+command |
| cline | Cline | `.clinerules` | markdown | `.md` | `$ARGUMENTS` | rule |
| codex-cli | OpenAI Codex CLI | `.codex/prompts` | toml | `.toml` | `$ARGUMENTS` | command |
| cody | Sourcegraph Cody | `.sourcegraph/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| continue | Continue | `.continue/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| crush | Crush | `.crush/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| cursor | Cursor | `.cursor/rules` | markdown | `.mdc` | `$ARGUMENTS` | rule+command |
| devin | Devin | `.devin/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| firebase-studio | Firebase Studio | `.idx/airules` | markdown | `.md` | `$ARGUMENTS` | rule |
| gemini-cli | Gemini CLI | `.gemini/commands` | toml | `.toml` | `{{args}}` | command |
| gemini-code-assist | Gemini Code Assist | `.gemini/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| github-copilot | GitHub Copilot | `.github/instructions` | markdown | `.instructions.md` | `$ARGUMENTS` | rule+command |
| goose | Goose | `.goose/recipes` | yaml | `.yaml` | `{{args}}` | rule+command |
| jules | Jules | `.jules/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| junie | Junie | `.junie/guidelines` | markdown | `.md` | `$ARGUMENTS` | rule |
| kilo-code | Kilo Code | `.kilocode/rules` | markdown | `.md` | `$ARGUMENTS` | rule+command |
| kiro | Kiro | `.kiro/steering` | markdown | `.md` | `$ARGUMENTS` | rule |
| melty | Melty | `.melty/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| opencode | OpenCode | `.opencode/rules` | markdown | `.md` | `$ARGUMENTS` | rule+command |
| openhands | OpenHands | `.openhands/microagents` | markdown | `.md` | `$ARGUMENTS` | rule |
| pearai | PearAI | `.pearai/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| q-cli | Q CLI | `.q/rules` | markdown | `.md` | `$ARGUMENTS` | rule+command |
| qwen-code | Qwen Code | `.qwen/rules` | markdown | `.md` | `$ARGUMENTS` | rule+command |
| replit | Replit Agent | `.replit/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| roo-code | Roo Code | `.roo/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| sweep | Sweep | `.sweep/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| tabnine | Tabnine | `.tabnine/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| trae | Trae | `.trae/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| void | Void | `.void/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| warp | Warp | `.warp/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| windsurf | Windsurf | `.windsurf/rules` | markdown | `.md` | `$ARGUMENTS` | rule+command |
| windsurf-next | Windsurf Next | `.windsurf-next/rules` | markdown | `.md` | `$ARGUMENTS` | rule |
| zed | Zed | `.rules` | markdown | `.md` | `$ARGUMENTS` | rule |
