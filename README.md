# Prosaic

Author canonical Markdown-with-YAML prose once; distribute it to 40 AI coding
targets. Prosaic also inspects neutral artifacts for Prosaic Runtime and Harness.

## Install

Prosaic 0.4.0 is Python 3.11+. Its public distribution is `b3-prosaic`; the
repository, Python import module and CLI remain `prosaic`. There is no Node.js
runtime dependency. The normal package-index channel starts with this release.

```sh
uv tool install 'b3-prosaic==0.4.0'
# Alternative:
pipx install 'b3-prosaic==0.4.0'
```

The GitHub release provides the same qualified wheel and source archive as the
package index. Use a fresh virtual environment or reinstall a pipx/uv tool when
migrating from the old `prosaic` distribution: old and new distributions share
import files and must not coexist. PyPI's unrelated `prosaic` project is not this
SDK. Historical release names and bytes remain unchanged. npm installation and
the JavaScript library API are retired; remove its old CLI and check
`command -v prosaic` when switching a global installation.

## Quick start

Create `.prosaic/commands/greet.md`:

```markdown
---
description: Greet the user
---
Say hello to $ARGUMENTS.
```

Then preview and distribute it:

```sh
prosaic apply --targets claude-code --dry-run
prosaic apply --targets claude-code
prosaic inspect commands/greet.md
prosaic resolve commands/greet.md --target claude-code
prosaic revert --targets claude-code --dry-run
```

Canonical source directories are `rules/`, `skills/`, `subagents/`, and
`commands/`. Skill/subagent bundles retain their companion resources and
internal references.

## Configuration and commands

Existing filenames and keys remain supported: `prosaic.config.yaml`,
`prosaic.config.yml`, `.prosaic.yaml`, `source`, `targets`, `artifactTypes`,
`lossyPolicy`, `backupRetention`, and `packages`. Markdown and manifest formats
are unchanged.

```yaml
source: .prosaic
targets: [claude-code, codex-cli]
artifactTypes: [rule, skill, subagent, command]
lossyPolicy: warn
backupRetention: 3
```

```sh
prosaic apply --dry-run
prosaic apply
prosaic revert --dry-run
prosaic revert
prosaic import ./foreign --format claude-code --dry-run
prosaic resolve commands/deploy.md --target claude-code
prosaic inspect subagents/reviewer.md --json
prosaic validate --json --strict --targets claude-code
prosaic tools --source .prosaic
prosaic package deploy my-package --dry-run
prosaic package revert my-package --dry-run
```

`inspect`, `resolve`, and `tools` emit JSON. Import warnings go to stderr;
apply warnings remain on stdout. Explicit `--color` / `--no-color`,
`NO_COLOR`, and `FORCE_COLOR` retain the CLI presentation contract.

See [read-only validation](docs/validation.md), [package deployment](docs/packages.md), [target contracts](docs/target-contracts.md),
[adding a target](docs/add-a-target.md), and [examples](examples/README.md).

## Neutral CLI-tool catalogue

`prosaic tools` lists sorted YAML/YML manifests from `<source>/tools`;
`--directory <path>` selects an explicit directory. Discovery is bounded,
non-recursive and read-only. It never resolves executables, probes, installs,
executes, or grants access. Malformed/duplicate/oversized/symlinked manifests
fail closed. The Python API is `discover_tools(directory)`.

Execution belongs in Prosaic Runtime with operator-configured grants.
See the [companion CLI-tool guide](https://github.com/B3Cognition/prosaic-runtime/blob/main/docs/cli-tools.md).

### Declarations are not permission grants

When executing through the companion Runtime/Harness, an agent can declare
`tools: [analyze_spec]` in Markdown frontmatter. That requests a tool; it does
not install it, trust its manifest, grant filesystem/network access, or enable
an OS sandbox. Installing an executable or listing it with `prosaic tools` also
grants nothing.

The operator must independently configure Runtime `allowed_tools` and trust
the manifest directory via `tool_directories`. The host then grants the tool
and narrow `read_roots` in a Runtime invocation or Harness agent step. Missing
grants deny access. Markdown and model output cannot expand these permissions.

Runtime 0.5.2+ and Harness 0.4.2+ support `cli_sandbox: {mode: required}`
in **Runtime YAML, not Markdown**. This isolates custom CLI subprocesses/probes
with macOS Seatbelt or Linux Bubblewrap, not Python callbacks or native coding
providers. It defaults to off;
upgrading Prosaic alone does not activate it. See the
[sandboxed Runtime example](https://github.com/B3Cognition/prosaic-runtime/blob/main/examples/README.md#sandboxed-cli-tools-runtime-052)
or [sandboxed Harness workflow](https://github.com/B3Cognition/prosaic-harness/blob/main/examples/README.md#sandboxed-cli-workflow-harness-042)
for installation, all permission layers and offline verification.

## Python API

```python
from pathlib import Path
from prosaic import (apply, inspect_artifact, resolve_execution_data, discover_tools,
                     validate_artifact_definition, validate_project)

root = Path('/path/to/project')
inspection = inspect_artifact(root, 'subagents/reviewer.md')
preview = apply(root, cli={'targets': ['claude-code']}, dry_run=True)
project_report = validate_project(root, {'targets': ['claude-code']}, strict=True)
resolved = resolve_execution_data(root, 'commands/deploy.md', 'claude-code')
catalogue = discover_tools(root / '.prosaic/tools')
validation = validate_artifact_definition('subagent', {
    'name': 'reviewer', 'description': 'Review supplied prose',
})
```

`validate_artifact_definition(kind, frontmatter)` performs pure canonical validation
for explicit `rule`, `skill`, `subagent`, or `command` definitions. It returns
`{'ok': True, 'frontmatter': ...}` with a shallow metadata copy, or
`{'ok': False, 'field': ..., 'reason': ...}`. A supplied `type` must match `kind`;
an absent `type` stays absent. Validation retains extension metadata and never
reads files or executes tools. Runtime applies its execution constraints separately.

Python function names use snake_case; serialized contract keys retain camelCase.
Registry injection, configuration precedence, target registration and pipeline
operations remain available. This package distributes/inspects prose; it does
not execute models or orchestrate application workflows.

## Development and verification

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/python scripts/verify_migration.py
.venv/bin/python -m pytest
.venv/bin/python -m build
python3 -m venv .wheel-test
.wheel-test/bin/python -m pip install dist/prosaic-0.3.1-py3-none-any.whl
.wheel-test/bin/python scripts/wheel_smoke.py
```

The verifier restores immutable TS v0.2.0 from this repository's Git history,
runs Python differential/golden tests and original CLI suites through Python,
and records `parity-results/latest.json`. Node/npm are required only for the
frozen oracle, never for installed usage. Python CI covers 3.11, 3.12 and 3.13.
Use `--consumers ../prosaic-runtime ../prosaic-harness --freeze-consumers`
for tests against immutable consumer snapshots.

[Validation history](docs/parity-status.md) and
[0.3.0 migration notes](docs/release-0.3.0.md) distinguish completed trials
from untested workflows. Runtime/Harness live staged/preloaded workflows passed.
Echelon + Codex authored, reviewed, repaired, and validated a reverse-text CLI
spec, stopping at its expected human approval checkpoint. Full design/planning/
publication, Claude, and delivery remain untested. The local endpoint's direct
forced-read limitation reproduced with TS and Python inspectors; see
[diagnosis](docs/tool-choice-diagnosis.md).

## Safety and license

Ownership manifests, integrity checks, contained paths, bounded backups, and
read-only dry runs protect application files. Python additionally rejects
dangling symlink escapes and bounds cyclic package-directory traversal. No
production consumer pin or global CLI installation is changed by this release.
The previous TS implementation remains recoverable from `v0.2.0`.

Apache-2.0; original attribution is retained in LICENSE and NOTICE.
