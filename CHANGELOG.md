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
- `prosaic resolve <artifactId> --target <targetId>` CLI subcommand: resolves an artifact-target pair's execution settings (model, reasoning effort, tools, execution type) as structured JSON on stdout, without writing any file or invoking a network call or LLM. Exits 1 with an `error: <message>` line on an unregistered target or an unresolvable artifact.
- Library API export `resolveExecutionData(opts: ResolveOptions): ResolveExecutionResult` and the lower-level pure function `resolveExecution(artifact, descriptor): ResolvedExecutionData`, both newly exported from the package root, for external orchestrators (e.g. Echelon) that need resolved execution settings without parsing generated provider files. `resolveExecutionData` never throws; callers branch on `result.ok` and, on failure, `result.errorKind` (`'unregistered-target' | 'artifact-not-found' | 'internal'`).
- New exported types: `ResolvedExecutionData`, `ResolveExecutionResult`, `ResolveOptions`, and the `ArtifactNotFoundError` error class.
- Resolution reuses the same neutral-to-concrete translation logic already used for file presentation (`translateNeutral`/`applyOverrides`/`resolveDeploymentType`), so resolved values never diverge from what `apply` would generate for the same artifact-target pair; an untranslatable neutral property is reported with `status: "unresolved"` rather than omitted.
- Library API export `runtimeCapabilityFor(desc: TargetDescriptor): RuntimeCapabilityDeclaration`, newly exported from the package root, plus `Registry.runtimeCapability(id: string)`, for querying a target's declared runtime-invocation acceptance (model, reasoning effort, tools, execution type) ahead of calling `resolveExecutionData`/`resolveExecution`. Each of the 4 fields reports `'accepts' | 'rejects' | 'unknown'`; an absent declaration, or an absent individual field, always reports `'unknown'` rather than assuming `'accepts'`. `Registry.runtimeCapability` throws `UnknownTargetError` for an unregistered target id, matching `.get()`/`.supports()`. New exported types: `RuntimeCapabilityDeclaration`, `RuntimeCapabilityFlag`, and the `RUNTIME_CAPABILITY_FLAGS` const. No built-in target currently declares a `runtimeCapability` value, so every built-in target reports all-`'unknown'` today; declaring per-target values is a separate follow-up.
- `examples/` directory with five self-contained, runnable example projects — `01-basic-write-preview-revert`, `02-multi-artifact-type`, `03-import`, `04-resolve`, and `05-multi-repository` — each pairing a narrative `README.md` with a project runnable using only files inside its own directory and no network access. Discoverable from a new `## Examples` section in the root `README.md` and indexed in `examples/README.md`.
- Example Verification Check (`tests/examples/examples.test.ts`, auto-discovered by the existing Jest `testMatch`): runs every example's declared CLI steps and byte-diffs live output against a committed Expected-Output Record, reporting a coverage gap (never a silent pass) for any example missing its `example.manifest.json`, and naming exactly one divergence-failure per byte-mismatched step.
- `prosaic inspect <artifactId>` CLI subcommand and library API export `inspectArtifact(opts: InspectOptions): InspectionResult`, both newly exported from the package root: a supported, machine-readable "inspect" capability that returns one discovered artifact's full neutral data (identifier, type, frontmatter, body, bundle root, bundled resources) as structured JSON, without writing any file or invoking a network call. Follows the same never-throws, discover-then-find, JSON-on-stdout pattern as `resolve`; an optional `--json` CLI flag is accepted for compatibility but never changes output, since output is unconditionally machine-readable. `resources`/`bundleRoot` are always present (`[]`/`null` for a standalone artifact), never omitted. Identifier lookup is exact case-sensitive comparison; a nonexistent identifier and a discovery-validation-dropped identifier both report the same `errorKind: 'artifact-not-found'` result in this release — distinguishing the two causes is deferred to a future revision. New exported types: `InspectedArtifact`, `InspectedResource`, `InspectionResult`, `InspectOptions`. No `--target` option exists on this command; inspect returns target-neutral, pre-translation data only.

### Changed

- README "Existing Repositories" adoption guide now points at the shipped `prosaic import` command for reverse-importing native tool directories, replacing the earlier "no import command yet" / "reverse import is not in the current CLI" notes that predated the import feature.

### Performance

- Measured: 100 artifacts × 30 targets distributed in ~816 ms (threshold: 30 000 ms); byte-identical output verified across 510 files on darwin/Node 26.
- Cross-environment reproducibility confirmed: deterministic render verified across Linux and macOS (NFR-007, NFR-009).
- Measured-runtime coverage evidence for resolve (NFR-002, NFR-004): 51 runtime-capable targets compared field-by-field against the FR-003 presentation translation outcome across 153 field comparisons with 0 divergent values, and all 51 targets carry at least 1 passing fixture test — both captured to `test-results/resolve-presentation-parity-nfr002.json` and `test-results/resolve-conformance-nfr004.json`.
- Measured-runtime crash-resilience evidence for resolve (NFR-001): `resolveExecutionData()` driven over a 39-case multi-axis malformed-input corpus (malformed frontmatter YAML, malformed `prosaic.config.yaml`, binary/NUL/huge/deeply-nested content, adversarial target/artifact ids, non-`Error` registry faults) with 0 uncaught crashes — every attempt yields either a valid resolution or a structured `errorKind` — captured to `test-results/resolve-malformed-input-nfr001.json`.
- Measured-runtime crash-resilience evidence for inspect (NFR-001): `inspectArtifact()` driven over a 40-case multi-axis malformed-input corpus (malformed frontmatter YAML, malformed `prosaic.config.yaml`, binary/NUL/huge/deeply-nested content, adversarial artifact ids, an unreadable-config fault) with 0 uncaught crashes — every attempt yields either a valid inspection or a structured `errorKind` — captured to `test-results/inspect-malformed-input-nfr001.json`.
- Benchmark artifacts committed to `test-results/` for auditable CI history across iterations.
- Full `test-results/` suite re-verified with no regressions; all NFR/SC evidence artifacts refreshed with new `recordedAt` timestamps and unchanged pass outcomes.

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
