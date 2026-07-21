# Prosaic

Prosaic distributes one canonical set of Markdown-with-frontmatter rules,
commands, skills, and subagents into the on-disk formats expected by many AI
coding tools.

Use it when you want to keep `.prosaic/` as the source of truth and generate
tool-specific files such as Claude Code commands or Cursor rules without
hand-maintaining every copy.

## Prerequisites

- Node.js 20 or newer.
- npm.
- A project directory where Prosaic can read source artifacts and write generated
  tool files.

Prosaic does not require network access or service credentials at runtime. It
reads local files and writes local files under the project root.

## Install

### From a local clone

```bash
cd prosaic
npm install
npm run build
npm link
prosaic --version
```

`npm link` puts the local `prosaic` executable on your PATH. If you do not want a
global link, run the built CLI directly from this repository:

```bash
node dist/cli/index.js --version
```

### From npm

After the package is published, install it globally:

```bash
npm install -g prosaic
prosaic --version
```

## First Run

The smallest useful run needs:

- one source directory, `.prosaic/`
- one `prosaic.config.yaml`
- at least one target
- at least one source artifact

The example below writes a rule and a command to Claude Code and Cursor.

### 1. Create a project

```bash
mkdir prosaic-demo
cd prosaic-demo
mkdir -p .prosaic/rules .prosaic/commands
```

### 2. Add a rule

Create `.prosaic/rules/style.md`:

```markdown
---
description: Shared writing style for AI tools.
---

Be concise.
Prefer concrete examples.
```

### 3. Add a command

Create `.prosaic/commands/release.md`:

```markdown
---
description: Prepare a release checklist.
---

Create a release checklist for {{args}}.
```

### 4. Add configuration

Create `prosaic.config.yaml`:

```yaml
targets:
  - claude-code
  - cursor
artifactTypes: [rule, command]
lossyPolicy: warn
```

Configuration is optional for defaults, but a first run should name explicit
targets so the generated files are easy to inspect.

Supported config files:

- `prosaic.config.yaml`
- `prosaic.config.yml`
- `.prosaic.yaml`

Common config keys:

| Key | Meaning | Default |
| --- | --- | --- |
| `source` | Source-of-truth directory | `.prosaic` |
| `targets` | `all` or a list of target IDs | `all` |
| `artifactTypes` | Any of `rule`, `skill`, `subagent`, `command` | all four |
| `lossyPolicy` | `warn` or `error` for non-representable intent | `warn` |
| `backupRetention` | Backups retained before overwrites | `3` |

See [Target On-Disk Contracts](docs/target-contracts.md) for target IDs and
their output contracts.

### 5. Preview the write plan

Run the dry run from the project root, the directory containing
`prosaic.config.yaml`:

```bash
prosaic apply --dry-run
```

Expected output for the starter project:

```text
Dry run (apply): 4 create, 0 overwrite, 0 backup, 0 remove, 0 unchanged. 0 files written, 0 files deleted.
create  .claude/commands/release.md [claude-code]
create  .claude/style.md [claude-code]
create  .cursor/commands/release.md [cursor]
create  .cursor/rules/style.mdc [cursor]
```

Dry runs do not write generated files or update the manifest.

### 6. Apply the generated files

```bash
prosaic apply
```

Expected output:

```text
apply: 4 created, 0 overwritten, 0 unchanged, 0 removed, 0 backed up. 4 changed file(s).
```

Expected files:

```text
.claude/commands/release.md
.claude/style.md
.cursor/commands/release.md
.cursor/rules/style.mdc
.prosaic-manifest.json
.prosaic/commands/release.md
.prosaic/rules/style.md
prosaic.config.yaml
```

`.prosaic-manifest.json` records the files Prosaic generated. Keep it if you want
safe `revert` and reconciliation behavior.

### 7. Re-run safely

Run `apply` again after no source changes:

```bash
prosaic apply
```

Expected result:

```text
0 changed file(s)
```

Prosaic is designed to make no-op re-applies byte-identical.

### 8. Revert generated files

Preview removals:

```bash
prosaic revert --dry-run
```

Expected output:

```text
Dry run (revert): 4 remove. 0 files deleted.
remove   .claude/commands/release.md [claude-code]
remove   .claude/style.md [claude-code]
remove   .cursor/commands/release.md [cursor]
remove   .cursor/rules/style.mdc [cursor]
```

Then remove only Prosaic-managed files:

```bash
prosaic revert
```

Expected output:

```text
revert: 4 file(s) removed.
```

Hand-authored files not recorded in `.prosaic-manifest.json` are not deleted.

## Company-Managed Prose Repository

Yes: Prosaic can be used with a company-managed repository that owns the
canonical MD prose, then applied into one or many product repositories.

The key idea is that Prosaic always reads from one source directory and writes
generated tool files under the current project root. The company repository can
own the source, while each consuming repository owns its generated outputs and
its `.prosaic-manifest.json`.

Example company source repository:

```text
company-ai-prose/
  .prosaic/
    rules/
      engineering-style.md
      security-review.md
    commands/
      release-checklist.md
      triage-issue.md
    skills/
      code-review/
        SKILL.md
        checklist.md
    subagents/
      reviewer.md
```

Example consuming application repository:

```text
payments-api/
  vendor/
    company-ai-prose/          # submodule, subtree, package output, or CI checkout
      .prosaic/
  prosaic.config.yaml
```

`payments-api/prosaic.config.yaml`:

```yaml
source: vendor/company-ai-prose/.prosaic
targets:
  - claude-code
  - cursor
  - github-copilot
artifactTypes: [rule, command, skill, subagent]
lossyPolicy: warn
backupRetention: 3
```

Run Prosaic from the consuming repository root:

```bash
cd payments-api
prosaic apply --dry-run
prosaic apply
```

Generated files are written into `payments-api`, not into
`company-ai-prose`. For example, Claude Code files land under
`payments-api/.claude/`, Cursor rules under `payments-api/.cursor/`, and the
manifest under `payments-api/.prosaic-manifest.json`.

Common ways to wire the company source into product repos:

- **Git submodule or subtree:** keep `company-ai-prose` inside each repo under
  `vendor/` or `tools/`, then point `source` at it.
- **CI checkout:** in a workflow, check out both the product repo and the prose
  repo, then run `prosaic apply --source ../company-ai-prose/.prosaic`.
- **Package or artifact sync:** publish the `.prosaic/` directory as an internal
  package or build artifact, unpack it into the product repo, then run Prosaic.
- **Monorepo shared directory:** keep one shared `.prosaic/` tree at the monorepo
  root and run Prosaic from each package with `--source ../../.prosaic` or an
  equivalent config value.

Recommended version-control policy for consuming repos:

- Commit `prosaic.config.yaml` so each repo declares which targets it wants.
- Commit `.prosaic-manifest.json` if you want later `revert` and reconciliation
  to know exactly which files Prosaic owns.
- Decide whether generated tool files should be committed. Commit them if the
  tools need files present for every developer immediately after checkout; ignore
  them if CI or a bootstrap script regenerates them.
- Do not hand-edit generated tool files as the long-term source of truth. Edit
  the company `.prosaic/` artifact instead, then re-run `prosaic apply`.

Current limitation: Prosaic is a local filesystem CLI, not a central push
service. A company-managed setup still needs Git, CI, submodules, package
syncing, or another delivery mechanism to make the canonical `.prosaic/` tree
available in each consuming repository.

## Existing Repositories

Yes: Prosaic can be introduced into an existing repository, including one that
already has Claude, Cursor, Copilot, or other tool-specific files.

Prosaic now ships a `prosaic import` command that reverse-engineers existing
tool-specific files back into neutral `.prosaic/` source; see
[Import from Existing Tool Directories](#import-from-existing-tool-directories).
There is still no `prosaic init` or Ruler-style adoption command. Whichever path
you choose, adoption stays deliberately conservative: Prosaic will not perform a
content-changing overwrite of an existing target file unless that file is already
recorded in `.prosaic-manifest.json` as Prosaic-managed.

### Safe adoption flow

1. Install or build Prosaic.

   ```bash
   prosaic --version
   ```

2. Create the Prosaic source tree in the existing repo.

   ```bash
   cd existing-repo
   mkdir -p .prosaic/rules .prosaic/commands .prosaic/skills .prosaic/subagents
   ```

3. Copy or rewrite your canonical content into `.prosaic/`.

   For example:

   ```text
   .prosaic/rules/team-style.md
   .prosaic/commands/release.md
   .prosaic/skills/reviewer/SKILL.md
   .prosaic/subagents/security-reviewer.md
   ```

4. Add `prosaic.config.yaml` with a small target set first.

   ```yaml
   targets:
     - claude-code
     - cursor
   artifactTypes: [rule, command]
   lossyPolicy: warn
   ```

5. Preview without writing.

   ```bash
   prosaic apply --dry-run
   ```

   Review every planned `create`, `update`, and `remove` line. On a first run,
   expect mostly `create` lines. If a generated path would collide with an
   existing hand-authored file, the real apply refuses to overwrite it unless it
   is already managed by Prosaic.

6. Apply only after the dry run looks right.

   ```bash
   prosaic apply
   ```

7. Re-run to confirm idempotency.

   ```bash
   prosaic apply
   ```

   A clean adoption should report `0 changed file(s)` on the second run.

8. Commit the source and ownership state.

   ```text
   .prosaic/
   prosaic.config.yaml
   .prosaic-manifest.json
   ```

   Commit generated target files only if your team wants them present in Git.

### Handling files that already exist

Existing repos often already contain files such as:

```text
.claude/commands/release.md
.cursor/rules/team-style.mdc
.github/instructions/team.instructions.md
```

The fastest way to adopt these is `prosaic import <tool-directory>`, which
detects the source format and writes the neutralized artifacts into `.prosaic/`
for you (see [Import from Existing Tool Directories](#import-from-existing-tool-directories)).
To adopt them manually instead, choose the canonical version and place it under
`.prosaic/`:

| Existing file | Typical Prosaic source |
| --- | --- |
| `.claude/commands/<name>.md` | `.prosaic/commands/<name>.md` |
| `.claude/skills/<name>/SKILL.md` | `.prosaic/skills/<name>/SKILL.md` |
| `.claude/agents/<name>.md` | `.prosaic/subagents/<name>.md` |
| `.cursor/rules/<name>.mdc` | `.prosaic/rules/<name>.md` |
| `.github/instructions/<name>.instructions.md` | `.prosaic/rules/<name>.md` |
| `.github/prompts/<name>.prompt.md` | `.prosaic/commands/<name>.md` |

After that, run `prosaic apply --dry-run` and compare the planned generated
output against the existing tool files. If the output path already exists and
differs, choose one of these approaches:

- move the hand-authored file aside, run `prosaic apply`, then compare and delete
  the old file after review;
- update the `.prosaic/` source until generated output matches what you want;
- keep that target out of `targets` temporarily while you migrate the content.

### Using Prosaic beside Ruler

If the repository already uses Ruler, keep the tools' ownership boundaries clear.
Do not have Ruler and Prosaic both manage the same generated path at the same
time.

A conservative migration is:

1. Keep the existing Ruler setup untouched.
2. Create `.prosaic/` with one or two artifacts copied from the current source
   material.
3. Configure Prosaic for one target, preferably a target/path not currently
   managed by Ruler.
4. Run `prosaic apply --dry-run`.
5. Once the output is acceptable, stop generating that same path from Ruler and
   let Prosaic own it.
6. Commit `.prosaic-manifest.json` so Prosaic can safely reconcile and revert
   only the paths it owns.

Current limitation: migration from `.ruler/` or `.rulesync/` layouts is a
Post-MVP item. Reverse/pull import from native target directories, by contrast,
is now available through `prosaic import`.

## Source Artifacts

Prosaic classifies source files by directory or by explicit `type:` frontmatter.

| Type | Default source directory | Typical output |
| --- | --- | --- |
| `rule` | `.prosaic/rules/` | Rules, memories, instructions |
| `command` | `.prosaic/commands/` | Slash commands or command recipes |
| `skill` | `.prosaic/skills/` | Skill bundles with resources |
| `subagent` | `.prosaic/subagents/` | Agent definitions with resources |

Skills and subagents can include bundled resource files. Prosaic rewrites
internal references when distributing the bundle so generated outputs do not
point back to stale source paths.

## Import from Existing Tool Directories

Prosaic can also reverse-engineer existing tool-specific files back into neutral
source. The `import` command detects which tool produced a directory of prose
files, un-translates the concrete frontmatter into the neutral vocabulary,
writes prosaic source, and verifies fidelity by re-deploying and comparing to
the original.

### Quick Import

```bash
prosaic import .claude
```

Prosaic auto-detects that `.claude/` is Claude Code format, neutralizes every
artifact, and writes neutral source files into `.prosaic/`.

### Import with Explicit Format

If the directory layout is ambiguous or hand-authored, specify the format:

```bash
prosaic import .claude --format claude-code
prosaic import .cursor/rules --format cursor
```

### Dry Run & Preview

Preview exactly what will be imported before writing:

```bash
prosaic import .claude --dry-run
```

### Round-Trip Verification

Import automatically verifies that re-deploying the neutralized artifact to the
same tool reproduces the original file byte-for-byte:

```bash
prosaic import .claude
# Output includes round-trip verification results per file
```

If fidelity is not exact, import reports which keys or content differ. For
targets whose forward translation is not fully invertible, import preserves
non-invertible data under a per-target `overrides:` section and reports the
fidelity level.

Round-trip fidelity is guarded by two independent conformance oracles. The
self-referential oracle re-imports the tool's own forward output. The
genuine-foreign oracle round-trips against hand-authored/captured foreign files
committed under `conformance-fixtures/import-foreign/` — one static artifact per
import-stable target, in that tool's canonical on-disk form. Because these
fixtures are decoupled from the live serializer, re-deploying the neutralized
artifact must reproduce the committed original byte-for-byte, catching
serializer drift the self-referential oracle cannot (SC-003, FR-036, FR-037).

The same genuine-foreign corpus backs a set of measured-runtime safety checks
under `tests/safety/import/`. Instead of hand-maintained counters, these tests
run the real end-to-end `importRun` and observe the actual `fs` syscalls it
makes (`fs-instrument.ts`) plus before/after sha256 tree snapshots. They record
independent evidence that import is idempotent at the source level (NFR-002,
SC-006), drops nothing silently across the full target registry (NFR-005,
SC-002), imports with a single no-flag auto-detect command per target (SC-001),
and that preview/dry-run runs mutate zero files (FR-069):

```bash
npm test -- tests/safety/import
```

### Portability Warnings

Import warns about content that won't travel across tools, such as absolute
filesystem paths or tool-only frontmatter keys:

- Absolute path references are flagged with a suggestion to use project-relative paths
- Unknown frontmatter keys are preserved in overrides with a warning
- Tool-only keys injected at deploy time are stripped before reconstruction

A consolidated portability report is presented at the end of the run.

### Bundles and Companions

Import recognizes multi-file skill and subagent bundles, re-associates resource
files, and rewrites internal references. Tool companion metadata files are
consumed and their data recovered into the neutral artifact.

## Resolve Execution Settings for an Orchestrator

`prosaic resolve` returns the model, reasoning effort, tools, and execution
type Prosaic would use for a given artifact/target pair, as structured JSON —
for an external runtime orchestrator (e.g. Echelon) that wants to invoke the
right AI coding tool without parsing generated provider files or
reimplementing Prosaic's translation logic.

```bash
prosaic resolve rules/style.md --target claude-code
```

```json
{"artifactId":"rules/style.md","targetId":"claude-code","model":{"status":"unresolved"},"reasoningEffort":{"status":"unresolved"},"tools":{"status":"resolved","value":"Read, Edit"},"executionType":{"status":"resolved","value":"agent"}}
```

The response always has four fields — `model`, `reasoningEffort`, `tools`,
`executionType` — each reporting `status: "resolved"` or `status:
"unresolved"`; a property is marked `unresolved` rather than omitted when the
target has no translation rule for it.

Resolution never writes a file to any target's destination directory and
never makes a network call or invokes an LLM; repeated resolution of the same
artifact/target with unchanged source returns identical results. An
unregistered `--target` or an unresolvable `artifactId` causes exit code 1
with `error: <message>` on stderr, e.g.:

```bash
prosaic resolve rules/style.md --target no-such-target
# error: Unknown target: "no-such-target" is not in the target registry
```

Node.js/TypeScript consumers can call the library API directly instead of
spawning the CLI: `resolveExecutionData({ projectRoot, artifactId, targetId })`
is exported from the `prosaic` package and returns a `ResolveExecutionResult`
— `{ ok: true, data }` on success or `{ ok: false, errorKind, message }` on
failure — and never throws. Callers branch on `errorKind`:
`'unregistered-target'`, `'artifact-not-found'`, or `'internal'`.

Before invoking a target, a library consumer can check what it declares
support for: `runtimeCapabilityFor(descriptor)` (or
`registry.runtimeCapability(targetId)`) returns a `RuntimeCapabilityDeclaration`
with four fields — `model`, `reasoningEffort`, `tools`, `executionType` — each
`'accepts'`, `'rejects'`, or `'unknown'`. No built-in target currently
declares a `runtimeCapability` value, so every built-in target reports
all-`'unknown'` today; this is the correct default, not a missing feature,
and lets a caller distinguish "known unsupported" from "not yet declared."
`registry.runtimeCapability(id)` throws the same `UnknownTargetError` as
`registry.get(id)` for an unregistered target id.

## Command Reference

```bash
prosaic apply
prosaic apply --dry-run
prosaic apply --targets claude-code cursor
prosaic apply --types rule command
prosaic apply --source ./ai-artifacts
prosaic apply --lossy error

prosaic revert
prosaic revert --dry-run
prosaic revert --targets cursor

prosaic import <foreign-directory>
prosaic import <foreign-directory> --format <tool-id>
prosaic import <foreign-directory> --dry-run

prosaic resolve <artifactId> --target <targetId>
prosaic resolve <artifactId> --target <targetId> --source ./ai-artifacts
```

CLI flags override `prosaic.config.yaml` for that run.

## Safety Model

- **Contained writes:** every write and delete is confined to the project root;
  symlink escapes are refused.
- **Backups before overwrite:** existing target files are backed up before
  Prosaic overwrites them.
- **Manifest-based revert:** `revert` removes only files recorded in
  `.prosaic-manifest.json`; a missing or corrupt manifest aborts deletion.
- **Idempotent output:** repeated applies over unchanged sources produce
  byte-identical files and `0 changed file(s)`.
- **No silent loss:** lossy or skipped transformations emit warnings naming the
  artifact and target. Use `--lossy error` to fail instead of warning.

## Troubleshooting

### `Dry run (apply): 0 create`

Check that you ran Prosaic from the project root. Prosaic discovers
`prosaic.config.yaml` and `.prosaic/` relative to the current working directory.

Also check that your config selects at least one target and one artifact type.
`targets: []` is a valid no-op.

### `Unknown target`

The target ID in `prosaic.config.yaml` or `--targets` is not registered. Check
[Target On-Disk Contracts](docs/target-contracts.md) or
`src/registry/adapters/contract-matrix.md` for known IDs.

### `prosaic resolve` fails

`prosaic resolve` reports the same "unregistered target" failure as
`apply`/`revert` (exit 1, `error: Unknown target: ...`) rather than a silent
empty result. An `artifactId` that does not match any discovered artifact
fails with a distinct `error: ...` message (`artifact-not-found`) rather than
being conflated with the target-lookup failure.

### Revert refuses to run

`revert` requires a valid `.prosaic-manifest.json`. If the manifest is missing or
corrupt, Prosaic aborts instead of guessing which files it owns. Restore the
manifest, or remove generated files manually after reviewing them.

### Generated files overwrite something important

Prosaic backs up files before overwriting them. Review the backup files in the
project root and restore the one you need. Set `backupRetention` higher if you
want to keep more overwrite history.

### Lossy transform warnings

Some targets cannot represent every neutral frontmatter key. With
`lossyPolicy: warn`, Prosaic writes the file and reports the dropped intent. With
`lossyPolicy: error` or `--lossy error`, the run fails instead.

## Develop Prosaic

From this repository:

```bash
npm install
npm run build
npm test
npm run lint
```

Focused test files can be passed through Jest:

```bash
npm test -- tests/e2e/perf-100x30.test.ts
npm test -- tests/e2e/cross-env-byte-identity.test.ts
npm test -- tests/e2e/deterministic-render.test.ts
```

Main source directories:

- `src/cli/` - CLI entry point and argument handling
- `src/config/` - config loading, defaults, and CLI overrides
- `src/discovery/` - source artifact discovery and classification
- `src/pipeline/` - transformation stages
- `src/registry/` - target descriptors and conformance status
- `src/lifecycle/` - apply, dry-run, reconcile, and revert flows
- `src/write/` - guarded filesystem, containment, and backups

## Add or Update a Target

Targets are declarative adapter descriptors plus conformance fixtures. Start
with [Adding a Target](docs/add-a-target.md), then review
[Target On-Disk Contracts](docs/target-contracts.md). A descriptor may
optionally declare a `runtimeCapability` block (per-field
`accepts`/`rejects`/`unknown` for `model`, `reasoningEffort`, `tools`,
`executionType`) so callers can query acceptance via `runtimeCapabilityFor`/
`registry.runtimeCapability` before invoking the target; omitted fields
default to `unknown`.

## Performance and Verification

The delivery benchmark distributed 100 artifacts across 30 targets in about
816 ms, under the 30 second threshold. Deterministic rendering and
cross-environment byte identity are covered by the test commands above.

Resolve conformance and coverage are backed by measured-runtime evidence
(NFR-002, NFR-004), not just assertion-based pass/fail: a full conformance
run compares resolved execution data against the presentation translation
outcome for every registered target (0 divergent field values across all
compared fields), and every runtime-capable target carries at least 1 passing
fixture test. Both results are recorded in `test-results/resolve-presentation-parity-nfr002.json`
and `test-results/resolve-conformance-nfr004.json`.

Resolve is also covered by measured-runtime crash-resilience evidence
(NFR-001): `resolveExecutionData()` is driven over a 39-case multi-axis
malformed-input corpus (malformed frontmatter YAML, malformed
`prosaic.config.yaml`, binary/NUL/huge/deeply-nested content, adversarial
target/artifact ids, non-`Error` registry faults) with 0 uncaught crashes —
every attempt yields either a valid resolution or a structured `errorKind`.
Recorded in `test-results/resolve-malformed-input-nfr001.json`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
