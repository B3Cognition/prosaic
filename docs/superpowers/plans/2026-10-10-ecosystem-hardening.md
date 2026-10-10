# Ecosystem bugfix hardening implementation plan

> **For agentic workers:** Use test-driven development and independent task review. Execute the already authorized fixes without another design approval.

**Goal:** Fix the seven reproduced reliability defects without adding capabilities or changing public API contracts.

**Architecture:** Fail before filesystem mutation when source discovery is incomplete, replace generated files atomically, and use canonical roots for backup paths. Runtime checks cancellation/deadlines at actual dispatch and during bounded reads, and counts only attempted provider turns as uncertain. Harness cleans lease registration when renewal setup fails.

**Tech stack:** Python 3.11+, existing pytest suites, owned HTTP fixtures, existing PostgreSQL adapters, immutable SDK wheel qualification and Lab native CI.

**Requirements:** The seven reviewed reproductions in the current conversation; existing ecosystem design at `../specs/2026-10-10-ecosystem-production-design.md`.

## Constraints

- Preserve serialized camelCase contracts, on-disk formats and existing public API names.
- No new features, automatic retries, permissive validation options or public host bindings.
- Keep completed accounting/tool evidence when cancellation occurs later.
- No TypeScript/Node execution in Core production; Node remains the frozen test oracle.
- Preserve unrelated untracked research and all historical release evidence.
- Use `apply_patch` for edits. One writer per repository/file group.
- Use the existing `codex/ecosystem-production` branches; commits/pushes and qualification are authorized. Do not merge or publish unqualified bytes.
- Public publication still requires owner-configured PyPI publishers; no credential requests or invented public pins.

## Review focus

- Partial nested enumeration and individual read failures must not look like intentional deletion.
- Legitimately removed files and an empty readable source must still reconcile normally.
- Both accounting and observer callbacks may stop execution before paid dispatch.
- Partial JSON bodies and SSE lines must obey the absolute deadline, even with continuous bytes.
- Setup interruption must release local capacity and retain correct database uncertainty.

## Task 1: Core filesystem failures

**Files:** `src/prosaic/core.py`, `src/prosaic/packages.py`, `src/prosaic/lifecycle.py`, `src/prosaic/filesystem.py`; focused regressions under `tests/`.

**Interfaces:** Keep `apply`, `deploy_package`, `GuardedFs` and manifests compatible. Existing diagnostic discovery can retain nonmutating compatibility; mutation paths must reject incomplete IO.

- [ ] Add watched failing regressions for unreadable nested source/package directories, unreadable primary files, failed output write preserving old bytes, and repeated backups through a symlink project alias.
- [ ] Assert output and manifest bytes remain unchanged on incomplete IO; separately assert successful readable deletion/empty reconciliation.
- [ ] Fail before staging or mutation on incomplete scans; use the existing atomic writer for generated output; calculate backup-relative paths from one canonical root.
- [ ] Exercise failed replacement and cleanup without weakening reserved lock inode or containment protections. Preserve atomic-write permissions where required.
- [ ] Run focused tests, `.venv/bin/python -m pytest`, immutable migration verification, build and installed wheel smoke. Record RED/GREEN evidence.

Representative observable assertions:

```python
with pytest.raises(OSError):
    apply(root, {'targets': ['claude-code']})
assert output.read_bytes() == before
assert manifest.read_bytes() == manifest_before
```

## Task 2: Runtime dispatch, reads and usage

**Files:** `src/prosaic_runtime/runtime.py`, `accounting_capture.py`, existing bounded HTTP helpers where needed, targeted tests.

**Interfaces:** Keep `ProsaicRuntime.run`, policy, observer and recorder public signatures unchanged; internal bounded readers may be shared.

- [ ] Add watched failures for observer/prepare cancellation and exhausted invocation deadlines, both recorded and unrecorded dispatch.
- [ ] Check the full execution boundary immediately before real HTTP dispatch, after persisted intent. Refresh timeout using remaining deadline. Retain intent lineage on prevented dispatch.
- [ ] Add owned HTTP drip-feed tests for OpenAI JSON and partial SSE lines, including cancellation. Use real HTTP response behavior; keep synthetic provider calls bounded.
- [ ] Reuse bounded chunk reads with cancellation/deadline checks; preserve byte limits, eager usage observation and per-line Capture semantics.
- [ ] Add capped/uncapped Anthropic credential-failure regressions after a completed seven-token tool turn. Assert one provider request and complete seven-token usage, with the original credential failure retained.
- [ ] Count a failed native turn as uncertain only after an actual attempt, or with explicit trustworthy usage evidence.
- [ ] Run focused tests and full Runtime source suite, build and installed smoke. Record exact commands and any infrastructure limitations.

Representative observable assertions:

```python
assert provider_requests == 0  # cancellation during preparation
assert result.token_usage == 7  # later failure before a second request
assert result.metadata['provider_error_code'] == 'api_key_file_error'
```

## Task 3: Harness lease setup cleanup

**Files:** `adapters/postgres/src/prosaic_harness_postgres/store.py`, `transport.py` or `leases.py` only if necessary; registration/lease regression tests.

**Interfaces:** Keep `PostgresRunStore.lease` and fencing semantics unchanged; no uncertainty-driven retry.

- [ ] Watch ordinary scheduling failure and `KeyboardInterrupt` leak capacity in a one-slot fixture.
- [ ] Protect construction, acquisition, registration and renewal submission with teardown. Safely close an unsubmitted coroutine; drain any started renewal before releasing ownership.
- [ ] Preserve the primary failure if release also fails. Ensure a setup failure never grants an execution session to its caller.
- [ ] Verify another acquisition and close can succeed after a clean failed setup. Also retain the existing concurrent registration capacity regression.
- [ ] Run focused adapter tests and full Harness suite against compatible installed Runtime, with CLI on PATH; build/smoke adapter and base package. Native database cleanup evidence is required for final qualification.

Representative observable assertions:

```python
with pytest.raises(KeyboardInterrupt):
    with store.lease(first_id):
        pytest.fail('setup must not yield')
with store.lease(second_id):
    pass
store.close()
```

## Task 4: Review, artifacts and Lab closure

- [ ] Independently review each repository fix diff against these failure cases; resolve substantive findings without expanding scope.
- [ ] Prepare patch candidate identities without moving existing tags. Preserve unchanged recorder artifacts if possible; otherwise use a new adapter patch identity.
- [ ] Build/install fresh compatible SDK wheels and validate payload ownership, public smokes and dependency checks. Run required qualification at exact committed sources.
- [ ] Update the separate Lab candidate profile from actual successful new SDK runs and hashes, preserving public and historical release manifests.
- [ ] Run Lab source checks and the four native Linux AMD64/ARM64 × PostgreSQL 16/18 cells against the new original candidate bytes, including demo and exact-owned cleanup.
- [ ] Record sources, runs, artifact hashes and limitations; update existing draft PRs and consumer documentation. Public index publication remains pending owner setup.

No feature additions or format migrations are part of this plan.
