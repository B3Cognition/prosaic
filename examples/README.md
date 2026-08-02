# Examples

Self-contained, runnable Prosaic projects — each pairs a narrative
`README.md` with a project you can run with no file or network access
outside its own directory. Every example is covered by the automated
Example Verification Check (`tests/examples/examples.test.ts`), run as part
of `npm test`.

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
