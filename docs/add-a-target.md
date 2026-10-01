# Adding a Target

A target is a declarative descriptor plus conformance fixtures. Transformation
logic stays generic.

## Descriptor

Built-in descriptors live in `src/prosaic/registry.py`, in `_DESCRIPTORS` and
`_LONGTAIL`. Add a descriptor using the existing `_adapter` helper or a full
dictionary validated with `parse_descriptor`. Its serialized keys are camelCase:
`id`, `label`, `destinationDir`, `format`, `extension`, `argumentToken`,
`frontmatter`, `capabilities`, `naming`, and `translations`.

Choose Markdown, TOML, or YAML. Declare native rule/skill/subagent/command support,
artifact-specific `slots`, stripped/passthrough/injected frontmatter, argument
translation, and companions. Follow a nearby descriptor of the same format.
Runtime model interpretation does not belong in a target descriptor.

For an application-owned target, inject a `Registry`/`StaticRegistrySource` or
use `register_target(existing, descriptor)`; this keeps application policy out
of the shared built-ins.

## Verification

Add hand-checked generated and foreign-import fixtures under
`conformance-fixtures/` and Python tests under `tests/`. Assert exact generated
bytes, warnings, resource paths, idempotency, import/re-export behavior, and
inspect/resolve metadata. Existing frozen-reference tests protect shipped
targets; an intentionally new target needs its own independently authored
fixtures instead of changing the old oracle.

Run `.venv/bin/python -m pytest` after bootstrapping the frozen test oracle with
`scripts/verify_migration.py`. Update the [contract matrix](contract-matrix.md)
and [source provenance](contract-matrix.sources.md) when a built-in is added.
