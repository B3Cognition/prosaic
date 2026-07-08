# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Planned: watch-mode (`prosaic apply --watch`) for continuous distribution on source changes.

### Performance

- Measured: 100 artifacts × 30 targets distributed in ~816 ms (threshold: 30 000 ms); byte-identical output verified across 510 files on darwin/Node 26.
- Cross-environment reproducibility confirmed: deterministic render verified across Linux and macOS (NFR-007, NFR-009).

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
