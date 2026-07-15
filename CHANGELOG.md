# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `prosaic import` CLI command for reverse-engineering existing tool-specific prose files into neutral source.
- Auto-detection of tool format from directory conventions (e.g., `.claude/`, `.cursor/`) with fallback to explicit `--format` flag.
- Round-trip verification: after import, re-deploys neutralized artifacts to the originating tool and compares byte-for-byte against the original, reporting fidelity per file.
- Portability warnings for absolute paths, project-relative paths, unknown frontmatter keys, and tool-only data with concrete remediation suggestions.
- Per-target `overrides:` section for non-invertible or unknown keys, ensuring zero silent data loss.
- Support for multi-file skill and subagent bundles with resource re-association and internal reference rewriting.
- Companion metadata file consumption and per-target fidelity level reporting (fully-invertible, invertible-with-overrides, normalized-equivalent).
- Genuine-foreign round-trip conformance oracle (SC-003): round-trips against hand-authored/captured foreign files committed under `conformance-fixtures/import-foreign/` — one static artifact per import-stable target — so re-deploying the neutralized artifact must reproduce the committed original byte-for-byte. Decoupled from the live serializer, this oracle catches serializer drift the self-referential conformance oracle cannot.
- Testing commands documented: `npm run test:benchmark`, `npm run test:cross-env`, `npm run test:deterministic` for NFR verification.
- Measured-runtime import-safety evidence under `tests/safety/import/`: the real end-to-end `importRun` is exercised against a genuinely-foreign corpus (`conformance-fixtures/import-foreign/`, never produced by the tool's own forward pipeline) with syscall-level filesystem instrumentation (`fs-instrument.ts`) rather than hand-maintained counters. Covers source-level idempotency (NFR-002, SC-006), no-silent-drop across the full registry (NFR-005, SC-002), single-command auto-detect import per target (SC-001), the neutralize→gate→round-trip conformance gate (NFR-008), and preview/dry-run zero-mutation guarantees (FR-069).
- All 48 delivery tasks complete (100%); all 114 canonical requirements fulfilled or deferred-safe per spec-guard audit.
- Global `--color` / `--no-color` CLI flag to force terminal color on or off (auto-detected by default), accepted by `apply`, `import`, and `revert`.
- Standard `NO_COLOR` and `FORCE_COLOR` environment support, including `FORCE_COLOR=0` (disable) and `NO_COLOR`-wins-over-`FORCE_COLOR` precedence.
- Per-stream TTY-gated ANSI color styling of previews, run summaries, warnings, and errors (stdout and stderr resolved independently) via a plain-by-default, zero-runtime-dependency ANSI helper.
- Per-state color coding (created / overwrite / error / unchanged) plus an underlined path style, each paired with a non-color text/glyph signal for accessibility.
- ASCII glyph fallback (`[ok]`, `[drop]`, `->`) so non-interactive and legacy/non-UTF terminals stay ASCII-only.
- Aligned run-summary counts and a grouped portability report with one remediation line per warning, deterministic at any terminal width.

### Changed

- README "Existing Repositories" adoption guide now points at the shipped `prosaic import` command for reverse-importing native tool directories, replacing the earlier "no import command yet" / "reverse import is not in the current CLI" notes that predated the import feature.
- Warning lines now use the structured format `warning[<kind>] <artifact> → <target>: <message>` (the arrow is `->` in plain mode); error lines consistently begin with `error: `.

### Performance

- Measured: 100 artifacts × 30 targets distributed in ~816 ms (threshold: 30 000 ms); byte-identical output verified across 510 files on darwin/Node 26.
- Cross-environment reproducibility confirmed: deterministic render verified across Linux and macOS (NFR-007, NFR-009).
- Benchmark artifacts committed to `test-results/` for auditable CI history across iterations.
- Verified styled-run wall-clock stays within 5% of the plain baseline (NFR-006).

## [0.1.0] - 2026-07-09

### Added

- `prosaic apply` CLI command with `--dry-run`, `--targets`, and `--types` flags for distributing MD-prose artifacts to AI coding tool targets.
- `prosaic revert` CLI command for removing only Prosaic-managed files using the recorded path manifest.
- `prosaic.config.yaml` configuration schema: `source`, `targets`, `artifactTypes`, `lossyPolicy`, `backupRetention`.
- Support for four artifact types: `rule`, `skill`, `subagent`, `command` — classified by source directory or explicit `type:` frontmatter.
- First-class skill and subagent bundle distribution with internal reference rewriting to prevent broken links.
- Neutral behavior vocabulary (`execution`, `visibility`, `tools`, `color`, …) translated into per-target concrete frontmatter, with a per-target `overrides:` escape hatch.
- 40+ AI coding tool targets with per-target path, name, frontmatter, argument, and whole-file format rewriting.
- Idempotent apply: byte-identical output on re-apply with zero changed files.
- Non-destructive backup strategy: backups before every overwrite; missing or corrupt manifest aborts all deletion.
- Project-root containment: all writes and deletes confined to the project root; symlink escapes are refused.
- Lossy transformation detection: every skipped or lossy transformation emits a named warning.
- Managed-paths manifest tracking all Prosaic-written files for safe selective revert.
- Extension workflow: adding a target requires only a data edit plus a conformance fixture (see `docs/add-a-target.md`).

### Security

- Symlink escape prevention: path resolution refuses any write or delete outside the project root.
