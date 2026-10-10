# Workflow factory core API implementation

Implemented Task 1 of the Harness workflow-factory plan on 2026-10-10, on
`codex/validated-workflow-factory`. No commits, dependency installation, sibling
repository changes, live endpoint calls or publication were performed.

The public `prosaic.validate_artifact_definition(kind, frontmatter)` helper
returns the existing `ok`/`field`/`reason`/`frontmatter` contract. It accepts the
four canonical artifact kinds, rejects unknown kinds and conflicting or invalid
declared types, and delegates canonical field checks to `validate_frontmatter`.
Absent `type` metadata remains absent. Successful validation makes the same
shallow metadata copy as the existing validator and retains extension fields.
Non-dictionary frontmatter returns a controlled failure at `frontmatter`.

Changed files:

- `src/prosaic/core.py`: additive pure helper; existing validation, classification
  and discovery remain unchanged.
- `src/prosaic/__init__.py`: public export.
- `tests/test_public_validation.py`: 34 canonical contract cases, including
  metadata preservation and the existing permissive frontmatter contract.
- `README.md`: public API example and result/copy semantics.
- This implementation report.

Verification:

- Baseline `.venv/bin/python -m pytest -q`: **432 passed in 44.19s**.
- TDD red `.venv/bin/python -m pytest tests/test_public_validation.py -q`:
  **33 failed, 1 passed in 0.12s**; all new-helper cases failed at the missing
  public export, and the existing-validator compatibility case passed.
- Focused green: **34 passed in 0.03s**.
- Full post-change suite: **466 passed in 44.15s**.
- `.venv/bin/python scripts/verify_migration.py`: exit **0** using the existing
  immutable v0.2.0 oracle at `5e0423a289342547d1666db484330ac6adb4743a`.
  Python unit/static/differential checks: **466 passed in 43.77s**; original
  shipped CLI checks: **13 suites / 55 tests passed**. The verifier recorded
  its ignored local evidence in `parity-results/latest.json`.
- `git diff --check`: clean.

Build and installed-wheel verification are delegated to the parent task's
combined packaging work. No code concerns or test failures remain in this scope.
The unrelated pre-existing research document was preserved.
