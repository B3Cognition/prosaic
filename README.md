# Prosaic

**MD-Prose Distribution Engine** — author your rules, skills, subagents, and
commands once as canonical Markdown-with-YAML-frontmatter, and distribute them to
40+ AI coding tools with per-target path, name, frontmatter, argument, and
whole-file format rewriting.

Prosaic combines the target breadth and non-destructive reliability of Ruler with
the author-once / translate-many transformation depth of Spec-kit's distribution
engine — staying strictly within MD-prose distribution.

## Install

```bash
npm install -g prosaic
```

## Use

```bash
# Preview what apply would write (no disk changes)
prosaic apply --dry-run

# Distribute to every selected supporting target
prosaic apply

# Distribute to specific targets / artifact types
prosaic apply --targets claude-code cursor --types rule command

# Remove only the files Prosaic generated (never your hand-authored files)
prosaic revert
```

Configure with `prosaic.config.yaml` at your project root:

```yaml
source: .prosaic          # source-of-truth directory
targets: all              # or an explicit list of target ids
artifactTypes: [rule, skill, subagent, command]
lossyPolicy: warn         # warn | error on non-representable intent
backupRetention: 3
```

## Guarantees

- **Idempotent** — a no-op re-apply writes 0 changed files, byte-identical output.
- **Non-destructive** — backups before every overwrite; revert removes only files
  Prosaic recorded in its managed-paths manifest; a missing/corrupt manifest
  aborts all deletion.
- **Contained** — every write and delete is confined to the project root; symlink
  escapes are refused.
- **No silent losses** — every skipped or lossy transformation emits a warning
  naming the artifact and target.

## Artifact types

`rule`, `skill`, `subagent`, `command` — classified by source directory
(`rules/`, `skills/`, `subagents/`, `commands/`) or an explicit `type:` in
frontmatter. Skills and subagents are first-class bundles: their internal
references are rewritten so distributed bundles never ship broken links.

## Neutral behavior vocabulary

Declare intent once in tool-agnostic keys (`execution`, `visibility`, `tools`,
`color`, …) and Prosaic translates them into each target's concrete frontmatter,
with a per-target `overrides:` escape hatch for intent that has no neutral
equivalent.

## Extend

Adding a target is a data edit plus a conformance fixture — no core code changes.
See [docs/add-a-target.md](docs/add-a-target.md).

## Develop

```bash
npm install
npm run build
npm test
npm run lint
```
