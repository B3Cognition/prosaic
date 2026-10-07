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

## Executing tools: use the companion Runtime/Harness examples

The projects above demonstrate distribution and inspection, not model/tool
execution. `tools: [analyze_spec]` in Markdown is a declaration, not a host
permission grant. `prosaic tools` only inspects manifests; it never installs,
probes, executes, or authorizes their executables.

For execution, use the
[sandboxed Runtime walkthrough](https://github.com/B3Cognition/prosaic-runtime/blob/main/examples/README.md#sandboxed-cli-tools-runtime-052)
or [sandboxed Harness workflow](https://github.com/B3Cognition/prosaic-harness/blob/main/examples/README.md#sandboxed-cli-workflow-harness-042).
They cover installing the trusted CLI, Runtime allowlists, invocation/step read
grants, required-mode OS setup, offline preflight and explicit live execution.
Sandbox settings belong in operator-owned Runtime YAML, not Prosaic Markdown.
These sandbox examples require Runtime 0.5.2+ and Harness 0.4.2+; upgrading
Prosaic alone does not enable sandboxing. See [permission ownership](../README.md#declarations-are-not-permission-grants).
