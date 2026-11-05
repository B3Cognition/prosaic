# Native output contracts

Fresh projects default to the corrected Claude Code and AGENTS.md layouts.
Prosaic identifies a fresh project by the absence of existing Prosaic
configuration and ownership files, rather than by when Python was installed.
Existing configuration without a selector and existing legacy manifests retain
legacy behavior. Native ownership records preserve native behavior on later
runs, including after a config is added or the selector is omitted.
An existing repository cloned without either configuration or provenance is
indistinguishable from a fresh project. Pin `outputContracts: legacy` in that
repository if its previous layouts must be retained across clean checkouts.

To migrate an existing project or select the contract explicitly, add:

```yaml
outputContracts: native-v1
targets: [claude-code, agents-md]
```

Commit the explicit `outputContracts: native-v1` selector when adding a config
to a native project. Its local ownership ledger remembers the native choice,
but a clean CI checkout without provenance treats a selector-free existing
config as legacy. Pinning the selector makes development and CI agree.

The native registry is versioned `1.1.0-native.1`. Other targets retain their
existing descriptors and support flags. This release does not refresh the
other targets, enable personal installs, or generate a CLAUDE.md pointer.
Injected application registries keep their own descriptor policy.

To keep legacy layouts explicitly, use `outputContracts: legacy`. Returning
from managed native outputs to legacy requires reverting those outputs first.

## Provider scope

This setting controls `prosaic apply` output files. The native overlay changes
the `claude-code` and `agents-md` distribution targets. Codex can read the
generated AGENTS.md; the `codex-cli` target descriptor is unchanged.

It does not change Runtime provider execution, including the OpenAI-compatible
provider. Runtime reads canonical artifacts through `prosaic inspect` and
renders the prompt itself. Provider endpoints, models, effort mapping, tool
calling and native Claude/Codex invocation are unaffected.

## Output

- Claude rules: `.claude/rules/<name>.md`. Native `paths` frontmatter passes
  through; Claude scopes it to matching files. Rules without `paths` load at
  launch, subject to Claude's project settings.
- Claude skills: `.claude/skills/<name>/SKILL.md`, with each resource inside the
  same skill directory. Two skills can safely contain `references/modules.md`.
- Claude agents remain `.claude/agents/<name>.md`; commands remain
  `.claude/commands/<name>.md`.
- `agents-md`: one root `AGENTS.md`, with rules sorted by canonical artifact ID,
  each under an ID heading. Rule frontmatter is omitted from the combined text.
  AGENTS.md is plain shared guidance; it does not implement Claude's `paths`
  scoping. Select the Claude target alone for Claude-specific scoped guidance.

The additive descriptor fields are `slots.rule`, slot `layout: bundle` with
`primaryName: SKILL.md`, and `aggregate: {file: AGENTS.md}`. Omitted layout
retains flat output. The aggregate is assembled by the project lifecycle;
`run_pipeline` continues to render a single artifact.

## Local content and ownership

AGENTS.md has one managed region:

```markdown
<!-- prosaic:begin -->

## rules/infra.md

Central rule text.

<!-- prosaic:end -->
```

Apply preserves bytes before and after that region, including CRLF and a
missing final newline in existing local content. Revert removes only the
owned region and its inserted separator. It deletes the file only if Prosaic
created it and no local content remains. Local content can be added outside
the markers at any time. Edit canonical source to change the managed text.

`.prosaic-blocks.json` tracks the block hash, insertion metadata and native
target ownership with an integrity checksum. Native target ownership remains
available even when a package deployment updates the file registry version.
Shared files never become ordinary whole-file manifest
entries: older clients cannot delete local AGENTS.md content through their
file ownership records. Keep the block ledger alongside the existing
`.prosaic-manifest.json` for local apply and revert. Both use the existing
project mutation lock. Do not copy or hand-edit provenance.

Malformed, duplicate, unowned or edited markers cause an error before output
mutation. Native mode also refuses to adopt user-authored files, even when
their content happens to match generated output. Resolve the conflict by
moving the local file somewhere safe; do not delete its contents blindly.

## Migrating existing output

1. Pin the same Prosaic version in development and CI; enable `native-v1`.
2. Run `prosaic apply --dry-run` and review replacements and removals.
3. Run `prosaic apply` and commit the generated files.

Planning checks all destination collisions, aliases and ownership before
writing. Legacy files are removed only when recorded by the old manifest and
their hashes still match. Edited files or handwritten destination files abort
the apply; both the old output and provenance remain intact. Move local edits
into canonical source or preserve them elsewhere before retrying.

All replacement writes and ownership saves finish before legacy cleanup.
A failed replacement rolls back completed output writes when they still match
Prosaic's written bytes, and leaves legacy outputs in place. Intervening local
edits are preserved. Filesystem/rollback errors are reported; no multi-file
filesystem transaction or recovery from abrupt process termination is claimed.

A partial `--types` selection updates selected types and preserves stale
whole-file entries, because legacy provenance has no artifact-type metadata.
Use a full apply for migration cleanup. `--targets` limits the target owners
whose outputs are reconciled. Native revert hash-checks file and block ownership,
including when the opt-in setting has since been removed. To return to legacy
layouts, revert the native outputs and then set `outputContracts: legacy`.

## CI drift checks

```sh
prosaic check
prosaic check --json
```

Exit 0 means valid source and matching expected output; exit 1 means source
errors, missing/changed output, recorded stale output, an ownership conflict or an operational
error. JSON reports contain `schemaVersion: 1`, `clean`, `changedFiles` and
`issues`. A conflict can stop planning before the changed-file count is known;
check `clean` and the exit status rather than relying on that count.

Check performs no writes, creates no lock, and grants no ownership. It can
compare committed output on a clean CI checkout without local manifests.
Without provenance it cannot distinguish an extra stale generated file from
an intentional handwritten file in the same tool directory, so it checks only
the expected outputs. Make the file manifest available in CI when stale-file
inventory checks are required; preserve the block ledger too when it exists.
Local content outside an AGENTS.md block is ignored. Source warnings remain
warnings; use `prosaic validate --strict` separately to reject warnings too.
The existing `validate` and `apply --dry-run` exit contracts are unchanged.

## Verification and provenance

Regenerate current output fixtures and both contract tables with:

```sh
.venv/bin/python scripts/generate_contracts.py
```

Review the generated diff against
`conformance-fixtures/native-v1/source/`. Historical fixture trees and the
immutable v0.2.0 oracle are unchanged. The normal full suite still checks legacy
registry, serializer and lifecycle compatibility. See
[source provenance](contract-matrix.sources.md) for the audited tool docs.

Actual tool discovery must also be checked in a fresh Claude session using a
unique skill and rule sentinel. Filesystem conformance alone is not evidence
that a particular installed Claude version/configuration loaded them.
