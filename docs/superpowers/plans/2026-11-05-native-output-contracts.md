# Native output contracts implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; use test-driven-development and verification-before-completion.

**Goal:** Add opt-in native Claude layouts, managed AGENTS.md aggregation, safe migration and a read-only CI drift check.

**Architecture:** `outputContracts: native-v1` selects an overlay on the existing registry. A separate integrity-protected block ownership ledger keeps shared files out of legacy whole-file manifests and revert. Native planning preflights collisions and ownership before mutation; legacy rendering remains frozen.

**Tech Stack:** Python 3.11+, existing guarded filesystem, YAML and CommonMark libraries; no production Node execution.

**Spec:** User-approved scope in this chat, 2026-11-05: bundle output, managed AGENTS.md, hash-checked migration, prosaic check, opt-in contracts and generated conformance documentation. Registry refresh, user scope and CLAUDE.md pointers are deferred.

## Global constraints

- Preserve existing camelCase reports, on-disk file manifest format and default registry descriptors.
- Local edits and blocked migrations must survive apply/revert; malformed block markers fail closed.
- Leave Runtime, Harness, integration lab, immutable v0.2.0 fixtures and unrelated user files unchanged.
- Use apply_patch for source edits; run full pytest, build and installed-wheel smoke.

## Review focus

- Duplicate normalized/aliased output paths must fail before any output or provenance change.
- Edited legacy files, destination conflicts and failed replacement writes must not trigger legacy cleanup.
- Shared files with CRLF or no final newline preserve all bytes outside the managed region.
- Empty/filtered source selection and reverting after changing contract settings must respect block ownership.
- Older clients must never see shared AGENTS.md as an ordinary owned file.

## Tasks

### 1. Descriptor overlay and bundle rendering

Files: registry.py, config.py, pipeline.py, tests/test_native_contracts.py.
Interface: `registry_for_config(config, registry=None)`; additive descriptor `slots.rule`, `layout`, `primaryName`, `aggregate.file`.

- [x] Write failing tests for config opt-in, unchanged legacy output, Claude bundle resources and rule routing, descriptor validation.
- [x] Implement the overlay and bundle path routing; run targeted tests plus legacy pipeline differential tests.

### 2. Managed blocks and migration lifecycle

Files: new native.py and managed_blocks.py, lifecycle.py, tests/test_native_contracts.py.
Interfaces: native apply planning/execution consumes existing descriptors, discovery, GuardedFs and file Manifest; block ledger is `.prosaic-blocks.json`, never a whole-file ownership entry.

- [x] Write failing apply/revert tests for local content, marker errors, tampering, collisions, migration conflicts and write failures.
- [x] Add deterministic aggregation and guarded block ownership under the existing project lock.
- [x] Hash-check stale native/legacy removals, preflight replacements, preserve filtered outputs; retain legacy execution when no native state is present.
- [x] Run targeted lifecycle, package, lock and validation suites.

### 3. CI check and distributable evidence

Files: new checking.py, cli.py, __init__.py, script/fixture generator, docs, CHANGELOG.md, wheel_smoke.py, tests.
Interface: `check_project(...)` returns versioned camelCase report; `prosaic check [--json]` exits nonzero for source errors, drift or conflicts and performs no writes.

- [x] Write failing check tests for missing/tampered output, user-authored conflicts, malformed source and zero mutation.
- [x] Implement check using validation and dry-run planning without changing validate/apply-dry-run contracts.
- [x] Generate native fixtures and expanded matrix from registry, preserve historical fixtures, document migration and sources.
- [x] Run full pytest, build, isolated installed-wheel smoke with Node hidden, and final review.

## Execution record

- Baseline: 741 tests passed before implementation.
- Ruling: managed worktree setup was denied by the sandbox; execute in the original checkout, preserving unrelated changes, with no commits or branch changes.
- Ruling: user explicitly authorized implementation of the reviewed scope, so execute the plan continuously without another approval gate.
- Targeted verification: 259 legacy tests and 35 native regression tests passed.
- Final full verification: `.venv/bin/python -m pytest` completed with 776 passed in 167.14 seconds; no skipped or failed tests.
- Independent review: fixed package deployment erasing native safety metadata, whole-file/block ownership overlap, block unlink rollback failure, and zero-target revert mutation. Each fix has a regression test observed failing before the fix.
- Ruling: provenance-free check verifies expected outputs but cannot distinguish extra stale generated files from intentional handwritten files. Document requiring provenance for stale-inventory checks instead of classifying user files as generated.
- Ruling: native whole-file ownership metadata is persisted as nativeTargets in the separate ledger, independent of package updates to the global registry version.
- Build: isolated wheel and sdist completed successfully in /tmp/prosaic-native-final-dist.
- Installed-wheel smoke: 16 checks passed from /tmp/prosaic-native-wheel-env with Node hidden, including native apply/check/resource isolation/revert and preservation of local AGENTS.md bytes.
- Live acceptance limit: installed Claude Code 2.1.308 advertised the generated prosaic-native-probe skill in its init event; model invocation returned Not logged in. Rule loading and reference execution remain unverified in a logged-in session.
- User correction: native-v1 is now the default for fresh projects with neither configuration nor provenance. Existing selector-free configuration and legacy manifests retain legacy behavior; explicit settings win. Native ledger presence retains the selected contract across later local runs.
- Default-selection review: a filtered native apply with zero outputs must still persist the native ledger. A regression reproduced the native-to-legacy fallback before fixing empty-ledger persistence.
- CI ruling: committed configurations should pin outputContracts explicitly. A native local ledger is not available in a provenance-free CI checkout; selector-free existing configs deliberately retain legacy compatibility there.
- Provider verification: Runtime's artifacts.inspect_artifact invokes canonical prosaic inspect. No Runtime code changed; a regression verifies that layout selection leaves canonical inspection identical.
- Verification after default change: 780 full-suite tests passed in 164.14 seconds. Wheel/sdist build succeeded; 17 installed-wheel smoke checks passed with Node hidden, including fresh-project default routing. Legacy oracle fixtures retain selector-free existing-project configuration, preserving their original output assertions.
