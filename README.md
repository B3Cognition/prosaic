# Prosaic

Author canonical Markdown-with-YAML prose once; distribute it to 40 AI coding
targets. Prosaic also inspects neutral artifacts for Prosaic Runtime and Harness.

## Install

Prosaic 0.3.0 is Python 3.11+. The repository, distribution, import module, and
CLI remain `prosaic`. There is no Node.js runtime dependency.

```sh
uv tool install git+https://github.com/B3Cognition/prosaic.git@v0.3.0
# Alternative:
pipx install git+https://github.com/B3Cognition/prosaic.git@v0.3.0
```

The GitHub release provides a wheel and source archive, not an npm package or
a PyPI publication. npm installation and the JavaScript library API are retired.
Existing consumer installers pinned to TS need an explicit update. When switching
a global installation, explicitly uninstall its old npm CLI and check
`command -v prosaic` so PATH does not select the old executable.

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
prosaic tools --source .prosaic
prosaic package deploy my-package --dry-run
prosaic package revert my-package --dry-run
```

`inspect`, `resolve`, and `tools` emit JSON. Import warnings go to stderr;
apply warnings remain on stdout. Explicit `--color` / `--no-color`,
`NO_COLOR`, and `FORCE_COLOR` retain the CLI presentation contract.

See [package deployment](docs/packages.md), [target contracts](docs/target-contracts.md),
[adding a target](docs/add-a-target.md), and [examples](examples/README.md).

## Neutral CLI-tool catalogue

`prosaic tools` lists sorted YAML/YML manifests from `<source>/tools`;
`--directory <path>` selects an explicit directory. Discovery is bounded,
non-recursive and read-only. It never resolves executables, probes, installs,
executes, or grants access. Malformed/duplicate/oversized/symlinked manifests
fail closed. The Python API is `discover_tools(directory)`.

Execution belongs in Prosaic Runtime with operator-configured grants.
See the [companion CLI-tool guide](https://github.com/B3Cognition/prosaic-runtime/blob/main/docs/cli-tools.md).

## Python API

```python
from pathlib import Path
from prosaic import apply, inspect_artifact, resolve_execution_data, discover_tools

root = Path('/path/to/project')
inspection = inspect_artifact(root, 'subagents/reviewer.md')
preview = apply(root, cli={'targets': ['claude-code']}, dry_run=True)
resolved = resolve_execution_data(root, 'commands/deploy.md', 'claude-code')
catalogue = discover_tools(root / '.prosaic/tools')
```

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
.wheel-test/bin/python -m pip install dist/prosaic-0.3.0-py3-none-any.whl
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
