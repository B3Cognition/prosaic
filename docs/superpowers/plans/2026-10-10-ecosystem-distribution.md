# Ecosystem Distribution and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the qualified SDK train through compatible `b3-prosaic` index packages and exact GitHub artifacts, then qualify the lab against their downloaded bytes.

**Architecture:** SDK wheel metadata expresses compatible version ranges; the lab locks exact versions and hashes. Clean-tag artifact builders and content/provenance gates feed one immutable publication path with PyPI OIDC and post-publication payload auditing.

**Tech Stack:** Python 3.11+, setuptools/build, pip/twine, GitHub Actions, PyPI Trusted Publishers, existing native pytest/PostgreSQL qualification workflows.

**Spec:** `docs/superpowers/specs/2026-10-10-ecosystem-production-design.md`, Milestones 6 and 7's release boundary.

## Global Constraints

- Python imports, CLI commands and repository names remain unchanged.
- Normal SDK wheel metadata contains versioned index requirements and no direct Git URLs.
- The public distribution family is `b3-prosaic`, `b3-prosaic-runtime`, `b3-prosaic-runtime-postgres`, `b3-prosaic-harness`, `b3-prosaic-harness-postgres`.
- Target versions are Core 0.4.0, Runtime 0.8.0, Harness 0.7.0 and both PostgreSQL adapters 0.2.0.
- Historical release bytes, manifests and receipts are immutable and retain their original names.
- New/old distributions share import paths and must not be installed together.
- Builds originate from an exact clean tag/commit archive; untracked research and private/generated run data are excluded.
- Final public uploads follow all intended source changes and required synthetic/native qualification.
- No paid inference or mutation of unrelated resources is required.

## Review Focus

1. A resolver selects the unrelated PyPI `prosaic`: inspect the actual installed dependency closure (Task 1).
2. Preserved legacy wheels coexist in caches: manifest-driven active installation must exclude them (Tasks 1 and 3).
3. A local untracked document enters an archive: clean source/content gates must catch it (Task 2).
4. A same-version retry changes release bytes: publication must refuse replacement (Task 3).
5. A candidate test result is attached to different uploaded bytes: receipts and downloaded payload audits bind both wheel and source hashes (Task 3).

### Task 1: Index-compatible SDK metadata and migration qualification

**Files:**
- Core: `pyproject.toml`, `src/prosaic/__init__.py`, `README.md`, `CHANGELOG.md`, `scripts/wheel_smoke.py`, `.github/workflows/ci.yml`.
- Runtime: `pyproject.toml`, package version exports, `adapters/postgres/pyproject.toml`, adapter version exports, README/changelog/source manifest and existing workflow/smoke commands.
- Harness: `pyproject.toml`, package version exports, `adapters/postgres/pyproject.toml`, adapter version exports, README/changelog/source manifest and existing workflow/smoke commands.
- Lab: dependency audit/install hooks from its own Task L1, followed by published manifest in L6.

**Interfaces:**
- Consumes: all reviewed Core/Runtime/Harness feature commits and public imports.
- Produces: index-compatible qualified candidate wheels and source archives.

- [ ] Add a behavioral packaging test that builds each SDK from a clean source snapshot, reads its wheel METADATA, installs the five-wheel closure into a fresh environment and runs public CLI/factory/tool examples without Node or editable sibling checkouts. Assert import files are owned by the selected b3 distributions and the unrelated/legacy distributions are absent.

```python
installed = {d.metadata['Name'].lower().replace('_', '-') for d in metadata.distributions()}
assert {'b3-prosaic', 'b3-prosaic-runtime', 'b3-prosaic-harness'} <= installed
assert not {'prosaic', 'prosaic-runtime', 'prosaic-harness'} & installed
assert callable(WorkflowFactory.build_json)
```

The assertion runs inside the clean installed environment. Also audit adapter
ownership and execute their real documented public constructors against synthetic
or owned PostgreSQL fixtures. Do not merely grep pyproject source text.

- [ ] Record the expected failure against existing legacy wheel metadata.
- [ ] Rename distribution metadata and normalize wheel globs. Runtime depends on `b3-prosaic>=0.4,<0.5`; Harness depends on `b3-prosaic-runtime>=0.8,<0.9`; adapter ranges select their matching qualified SDK minor series. Keep import packages and entry points unchanged. Set the target versions consistently and add migration guidance using fresh virtual environments/images.
- [ ] Build candidate wheels from exact feature commits, perform fresh `--find-links` installs with a curated wheelhouse while index publication is pending, and test minimum supported third-party versions. Candidate manifests must be explicit and separate from published manifests.
- [ ] Independently review metadata, installed closure and provenance; commit each repository's metadata/docs changes with only one writer per repository.

### Task 2: Clean-source artifact gates and reproducible publication workflow

**Files:**
- Create in each SDK repository: `scripts/release_artifacts.py`, `tests/test_release_artifacts.py`, `.github/workflows/publish.yml`, `docs/package-index.md`.
- Modify: existing CI artifact paths/build verification to consume the new b3 names.
- Cross-repository shared source contracts are identical in intent; utilities remain standalone in each repository so release tooling does not need another unpublished dependency.

**Interfaces:**
- Consumes: exact tag/commit and expected distribution/version set.
- Produces: clean source build directory, audited wheels/sdists, SHA256SUMS and a versioned verification/provenance JSON receipt.

- [ ] Add failing subprocess tests with a tiny committed package fixture and an untracked `docs/private-untracked.md`. The builder must use `git archive` of the specified commit, never the working-tree tree; archive contents must omit the untracked file even when MANIFEST includes docs recursively.
- [ ] Add malformed archive path, wrong name/version, unexpected package payload, missing license/version data and wheel/sdist mismatch fixtures. A same-version existing release fixture with different bytes must fail.
- [ ] Implement pure content/metadata audit plus an explicit build command. Separate archive extraction, build, content verification and publication effects. Extract only contained regular files, reject absolute/parent traversal entries, and compare source entries with tracked paths plus approved generated metadata. Do not globally clean or delete a working tree.

```python
receipt = {
    'version': 1, 'source_commit': source_commit,
    'distributions': verified_metadata,
    'artifacts': [{'filename': path.name, 'sha256': sha256(path.read_bytes()).hexdigest()}
                  for path in qualified_paths],
}
```

Artifact hashing occurs after every final build; no receipt claims that a build
alone passed a test. Qualification records reference their actual commands,
versions, result counts and exact bytes.

- [ ] Create tag-scoped `publish.yml` with read-only build/test permissions and narrowly scoped GitHub write/PyPI OIDC publication jobs. Pin verified immutable action commits. Use environment `pypi` and document the five exact pending/trusted publisher tuples for owner `B3Cognition`, three SDK repos and workflow filename `publish.yml`.
- [ ] Gate publication on the actual required suite/platform results for the exact source revision and intended wheel/sdist hashes. Build once and transport those bytes between jobs; never rebuild after qualification without qualifying the rebuilt hashes.
- [ ] Run helper subprocess tests and source/wheel audit, independently review the workflow, then commit each repository's tooling.

### Task 3: Final release train and lab reflection

**Files/effects:**
- Repository release notes, verification receipts/checksums and versioned tags.
- Five PyPI projects/Trusted Publisher bindings and exact GitHub release assets.
- Lab `dependencies/releases.json`, lock files, immutable consumer image provenance, current documentation index and qualification receipts.

**Interfaces:**
- Consumes: independent feature/release reviews, full SDK suites, installed candidate checks and required native lab qualification.
- Produces: downloaded verified public release bytes and a qualified Lab 0.3.0 release.

- [ ] Complete all intended Runtime/Harness/Core/lab source tasks and the required synthetic conformance, recovery, fairness/load and architecture/PostgreSQL lanes. Keep deployment-specific live/provider/HA claims explicitly `not_qualified` unless their real opt-in evidence exists.
- [ ] Resolve available PyPI owner setup using the concrete publisher workflow; if account access is missing, provide exact owner setup instructions and continue unaffected qualification. Never request API tokens in chat or claim PyPI publication succeeded without a verified index result.
- [ ] Publish Core first, then Runtime plus recorder adapter, then Harness plus store adapter. Existing matching artifact hashes are idempotent success; differing bytes at the same version fail and require a new version. User has authorized qualified releases and pushes; do not ask again merely because these are external effects.
- [ ] Download GitHub and index distributions, verify wheel and sdist hashes/metadata/payloads and perform clean ordinary index installation. Confirm every active imported package belongs to the b3 family and no Git source installation occurs.
- [ ] Update the lab's exact published manifest and lock, use manifest-digest-isolated active caches, rebuild the consumer image, and run the four native architecture/PostgreSQL acceptance cells against published bytes. Generate legacy waiting/receipt fixtures from the actual immutable Lab 0.2.0 released dependency manifest and verify recovery after the upgrade.
- [ ] Publish Lab 0.3.0 after its required checks, record the exact image/source/dependency identity, and update the current-status index without rewriting historic evidence.
- [ ] Final independent whole-branch review and report: implemented features, release/index URLs, qualification evidence and remaining genuine external deployment inputs.

## Execution rulings

The user approved autonomous execution and waived further design handoffs. Work
uses dedicated `codex/ecosystem-production` branches in the existing four owned
checkouts. Parallel implementation is restricted to separate repositories; one
writer owns a repository's product changes/index at a time. This respects the
shared interfaces while avoiding unsafe concurrent edits or commits. Every task
retains independent review and test evidence.
