# Prosaic

Prosaic is a Python 3.11+ canonical Markdown distribution engine. Generic prose
parsing, target adapters, rendering, configuration, import, manifests, packages,
and read-only tool catalogue discovery belong here. Model execution belongs in
Prosaic Runtime; workflow orchestration belongs in Prosaic Harness or consumers.

Production code is under `src/prosaic/` and must not execute TypeScript or Node.
Keep serialized camelCase contracts and existing on-disk formats compatible.
Never execute catalogue manifests here; discovery is read-only configuration.

Use apply_patch for edits. Run `.venv/bin/python -m pytest` for the full suite.
For differential tests, bootstrap the immutable v0.2.0 TypeScript reference with
`.venv/bin/python scripts/verify_migration.py`. Node/npm are test-only oracles.
Build with `.venv/bin/python -m build`, and verify the installed wheel using
`scripts/wheel_smoke.py`. Preserve unrelated user changes and historic evidence.
