# Core Production Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent overlapping provenance mutations and provide read-only CI validation for canonical prose projects.

**Architecture:** Serialize mutation entry points with an OS-backed project lock and reserve its inode throughout filesystem mutation. Compose existing canonical discovery and rendering into a separate diagnostic report without changing legacy CLI behavior.

**Tech Stack:** Python 3.11+, pathlib/os, fcntl on POSIX, msvcrt on Windows, pytest and immutable TypeScript differential fixtures.

**Spec:** `docs/superpowers/specs/2026-10-10-ecosystem-production-design.md`, Milestone 5.

## Global Constraints

- Production code is under `src/prosaic/` and must not execute TypeScript or Node.
- Keep serialized camelCase contracts and existing on-disk formats compatible.
- Never execute catalogue manifests here; discovery is read-only configuration.
- The lock path is `.prosaic-operation.lock` under the canonical resolved project root.
- Never unlink the coordination file to release a lock.
- Dry-run and validation never create the coordination file or acquire the mutation lock.
- Existing manifest bytes, output ownership and report counts remain compatible.
- Existing help entries and legacy parser contracts remain byte-compatible.
- Use apply_patch for edits and preserve the unrelated untracked research note.

## Review Focus

1. A render target or old manifest names the lock inode: every mutation helper must refuse it (Task 1).
2. Two aliases name one project: actual competing processes must share one lock (Task 1).
3. A writer dies while staging: the next operation acquires ownership and existing reconciliation recovers (Task 1).
4. There are zero supported targets: broken canonical prose and bundle references still fail validation (Task 2).
5. Rendering raises for configured loss: diagnostics still collect all issues and respect configured error severity (Task 2).

### Task 1: Project mutation ownership and reserved coordination path

**Files:**
- Create: `src/prosaic/locking.py`, `tests/test_project_lock.py`.
- Modify: `src/prosaic/filesystem.py`, `src/prosaic/lifecycle.py`, `src/prosaic/packages.py`, `src/prosaic/__init__.py`, `.gitignore`, `docs/packages.md`.
- Existing regression suites: `tests/test_lifecycle.py`, `tests/test_packages.py`, `tests/test_cli.py`.

**Interfaces:**
- Consumes: `GuardedFs`, public `apply/revert/deploy_package/revert_package` entry points.
- Produces: `project_mutation_lock(project_root)` context manager, `ProjectBusyError` and `ProjectLockError`; `GuardedFs.assert_mutable(target, removing_directory=False)`.

- [ ] Write the process-based integration failure first. A child holds a real lock, the parent calls every mutation entry point, and the manifest/output bytes remain unchanged. Imports for the new module occur inside test bodies so missing code fails the test rather than collection.

```python
def test_apply_cannot_mutate_while_another_process_owns_project(tmp_path):
    from prosaic.locking import ProjectBusyError
    fixture(tmp_path)
    apply(tmp_path, {'targets': ['claude-code']})
    before = (tmp_path / '.prosaic-manifest.json').read_bytes()
    with holding_process(tmp_path):
        with pytest.raises(ProjectBusyError):
            apply(tmp_path, {'targets': ['claude-code']})
    assert (tmp_path / '.prosaic-manifest.json').read_bytes() == before
```

`holding_process` belongs in tests. It starts a labelled child running the real
context manager, waits for a ready marker over a pipe and always terminates/joins
that exact child. Use a finite ready/exit timeout; do not sleep to infer ownership.
Add package/package, package/apply and apply/revert coverage; a symlink alias must
conflict with the canonical project. Kill the owning child and verify a new apply
can acquire the lock and reconcile a staged interruption.

- [ ] Run `.venv/bin/python -m pytest -q tests/test_project_lock.py --tb=short` and record the expected missing-feature failure.
- [ ] Implement a fixed-file nonblocking advisory lock. Canonicalize the root, open with no-follow protection and `O_CLOEXEC` where available, reject nonregular files/unsafe identity, lock the descriptor and release it in `finally` without unlinking. POSIX uses `fcntl.flock(fd, LOCK_EX | LOCK_NB)`; Windows uses a one-byte nonblocking `msvcrt.locking` region with an explicit regular-file/reparse-point guard. Translate only contention into `ProjectBusyError`; permission, unsupported backend and unsafe path are lock errors.

```python
@contextmanager
def project_mutation_lock(project_root):
    root = Path(project_root).resolve(strict=True)
    descriptor = open_coordination_file(root / LOCK_FILENAME)
    try:
        acquire_nonblocking(descriptor)
        yield
    finally:
        release_and_close(descriptor)
```

The helpers are private and live in `locking.py`; they never run callbacks.
Reject a held inode whose path was replaced. Keep ownership through discovery,
planning, staging, writes/removals, manifest save and backup cleanup. Resolve
configuration and invalid package declarations before creating internal metadata;
zero-target no-op and every dry-run return without creating the lock file.
Wrap existing public entry points once, leaving unlocked private operation bodies
available only to those wrappers; do not lock recursive internal helpers twice.

- [ ] Add reserved-path checks underneath every GuardedFs write, atomic write, move source/destination, delete and directory removal. A source/target alias resolving to the lock or an ancestor removal must fail before replacing/deleting the inode. Add a synthetic render descriptor and a malicious old manifest entry naming the lock to verify apply/reconcile/revert protection.
- [ ] Test zero writes for untouched-project dry runs, unsafe symlink/directory/FIFO lock paths, independent projects, repeated operations and CLI busy handling. No manifest format or legacy output count changes are permitted.
- [ ] Run the focused suite, `.venv/bin/python -m pytest`, and `.venv/bin/python scripts/verify_migration.py`; native Windows lock coverage is required before claiming Windows support for the new implementation.
- [ ] Document cooperative filesystem locking, retained coordination metadata and nontransactional dry-run previews. Check the diff, then commit only Task 1 files as `Prevent concurrent project provenance mutations`.

### Task 2: Pure project validation and an additive CLI command

**Files:**
- Create: `src/prosaic/validation.py`, `tests/test_project_validation.py`, `docs/validation.md`.
- Modify: `src/prosaic/cli.py`, `src/prosaic/__init__.py`, `src/prosaic/data/help.json`, `README.md`, `scripts/wheel_smoke.py`.
- Reuse: `core.discover`, `pipeline.rewrite_references/run_pipeline`, `config.resolve_config`, `Registry`.

**Interfaces:**
- Consumes: canonical discovery warnings and supported target descriptors.
- Produces: `validate_project(project_root, cli=None, *, strict=False, registry=None, global_dir=None) -> dict` and `prosaic validate [--json] [--strict]`.

- [ ] Add a failing read-only integration test with valid and malformed artifacts and a broken bundle reference. Select zero targets so diagnostics cannot accidentally depend on rendering.

```python
def test_zero_targets_still_rejects_broken_bundle_reference_without_writes(tmp_path):
    from prosaic import validate_project
    bundle = tmp_path / '.prosaic/skills/check'
    bundle.mkdir(parents=True)
    (bundle / 'SKILL.md').write_text('---\ndescription: Check\n---\n[missing](missing.md)\n')
    before = tree_bytes(tmp_path)
    report = validate_project(tmp_path, {'targets': []})
    assert report['valid'] is False
    assert any(issue['code'] == 'unresolved-reference' for issue in report['issues'])
    assert tree_bytes(tmp_path) == before
```

`tree_bytes` is a test helper, including all regular files and relative paths.
Additional tests cover invalid frontmatter with secret canaries (no raw content in
issues), invalid classification/schema, unsupported targets, multiple rendering
losses, configured `lossyPolicy: error`, strict mode, valid projects and stable CLI
JSON/exit status. Preserve exact existing command help output in differential tests.

- [ ] Run `.venv/bin/python -m pytest -q tests/test_project_validation.py --tb=short` and record the expected missing-feature failure.
- [ ] Implement target-independent discovery/reference diagnostics, then per-target rendering with warning collection. Run rendering with warning mode to collect losses, then elevate loss severity if the resolved configuration requests `error`. Map known warning kinds to bounded safe messages and locations without serializing parser exceptions, body snippets or rejected values.

```python
report = {
    'schemaVersion': 1, 'valid': not errors and not (strict and warnings),
    'artifactCount': len(artifacts), 'errorCount': len(errors),
    'warningCount': len(warnings), 'issues': issues,
}
```

Issue fields are `code`, `severity`, optional `artifactId`/`targetId`, `location`
and `message`; deterministic ordering follows artifact/target/code/location.
Malformed/classification/schema/reference issues are errors. Unsupported pairs
and losses are warnings by default; configured loss errors and strict mode fail.
No application/deployment planning, manifest reads/writes, catalogue execution,
Runtime construction or version probes occur.

- [ ] Add only the new command's parser/help branch. Existing root and command help remain frozen. JSON is emitted without human warnings mixed into stdout; valid reports exit 0 and invalid reports exit 1. Operational/parser errors preserve existing exit/error behavior and do not masquerade as a validation report.
- [ ] Run focused tests, `.venv/bin/python -m pytest`, `.venv/bin/python scripts/verify_migration.py`, and the installed-wheel smoke after packaging tasks supply the new wheel.
- [ ] Document CI examples and safe interpretation: canonical validation is not execution authorization. Check the diff and commit Task 2 as `Add read-only project validation for authoring and CI`.

## Completion record

The controller records task commits, red/green evidence, independent review and
native platform qualification in this plan's SDD workspace. Publication belongs
to the separate ecosystem distribution plan after all intended source changes.
