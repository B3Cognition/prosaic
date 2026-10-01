# Examples

Self-contained, runnable Prosaic projects — each pairs a narrative
`README.md` with a project you can run with no file or network access
outside its own directory. These examples retain the original source/configuration fixtures. Install
Prosaic 0.3.0 with Python tooling before running the commands. Lifecycle and
rendering parity is checked by `scripts/verify_migration.py`.

- [01-basic-write-preview-revert](01-basic-write-preview-revert/README.md) —
  the full preview/write/re-apply/revert lifecycle for a minimal project.
- [02-multi-artifact-type](02-multi-artifact-type/README.md) — one artifact
  per source type, distributed to targets with different capabilities.
- [03-import](03-import/README.md) — recovering an existing tool's prose
  into neutral Prosaic source, including a malformed-file warning path.
- [04-resolve](04-resolve/README.md) — resolving an artifact/target pair's
  execution settings for an external orchestrator.
- [05-multi-repository](05-multi-repository/README.md) — a company-managed
  source repository consumed by a separate product repository.
