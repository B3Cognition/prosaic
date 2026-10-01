"""Opt-in live Runtime/Harness trial using the installed Python Prosaic wheel."""
from __future__ import annotations

import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import sys
import time

import yaml

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True)
    parser.add_argument('--profile', default='qwen')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--ts-baseline', action='store_true',
                        help='Diagnose direct-read behavior with the frozen TypeScript inspector')
    parser.add_argument('--direct-read-only', action='store_true',
                        help='Run one fresh direct-read trial; never resume a previous run')
    parser.add_argument('--wire', action='store_true', help='Capture synthetic request/response bodies, never headers')
    args = parser.parse_args()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = (args.output or ROOT / 'parity-results' / ('live-' + stamp)).resolve()
    output.mkdir(parents=True, exist_ok=False)
    runtime = ROOT.parent / 'prosaic-runtime'
    harness = ROOT.parent / 'prosaic-harness'
    python_bin = Path(sys.executable).parent
    wheel_bin = ROOT / '.wheel-test/bin'
    cli_bin = output / 'typescript-bin' if args.ts_baseline else wheel_bin
    if args.ts_baseline:
        node = shutil.which('node')
        reference_cli = ROOT / '.reference/dist/cli/index.js'
        if not node or not reference_cli.exists():
            parser.error('TypeScript comparison requires Node and the frozen reference build')
        cli_bin.mkdir()
        launcher = cli_bin / 'prosaic'
        launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(node) + ' ' +
                            shlex.quote(str(reference_cli)) + ' "$@"\n')
        launcher.chmod(0o700)
    environment = {**os.environ, 'PATH': str(cli_bin) + os.pathsep + str(python_bin),
                   'NO_COLOR': '1'}
    if args.wire:
        environment['PROSAIC_TRIAL_WIRE'] = '1'
    assert shutil.which('prosaic', path=environment['PATH']) == str(cli_bin / 'prosaic')
    assert shutil.which('node', path=environment['PATH']) is None
    config = yaml.safe_load((runtime / 'examples/tokenproxy.yml').read_text())
    profile = config['profiles'][args.profile]
    key_env = profile.get('api_key_env')
    if key_env and not os.environ.get(key_env):
        parser.error(f'{key_env} must be loaded in the environment (never stored in the report)')
    # Keep this first migration trial on one operator-recommended tool model.
    config['default_profile'] = args.profile
    config['routes'] = {tier: args.profile for tier in ('fast', 'balanced', 'strong', 'ultra')}
    config_path = output / 'runtime.yml'
    config_path.write_text(yaml.safe_dump(config, sort_keys=False))
    report = {'started_at': stamp, 'endpoint': profile['base_url'], 'model': profile['model'],
              'prosaic_executable': str(cli_bin / 'prosaic'), 'node_on_path': False,
              'implementation': 'typescript-baseline' if args.ts_baseline else 'python-wheel',
              'consumer_revisions': {}, 'checks': [], 'success': False}
    for name, project in [('runtime', runtime), ('harness', harness)]:
        revision = subprocess.check_output(['/usr/bin/git', '-C', str(project), 'rev-parse', 'HEAD'], text=True).strip()
        report['consumer_revisions'][name] = revision
    if args.ts_baseline:
        from prosaic_runtime.artifacts import inspect_artifact
        artifact = 'subagents/evidence-reader.md'
        source = harness / 'examples/.prosaic'
        python_artifact = inspect_artifact(artifact, source, executable=str(wheel_bin / 'prosaic'))
        ts_artifact = inspect_artifact(artifact, source, executable=str(cli_bin / 'prosaic'))
        assert python_artifact == ts_artifact
        report['artifact_parity'] = {'identical': True, 'sha256': python_artifact.digest}

    def check(name, command, cwd, timeout=225):
        print(f'Running {name}; evidence: {output}', flush=True)
        started = time.monotonic()
        try:
            result = subprocess.run([str(x) for x in command], cwd=cwd, env=environment,
                                    text=True, capture_output=True, timeout=timeout)
            stdout, stderr, code = result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or b''
            stderr = error.stderr or b''
            stdout = stdout.decode() if isinstance(stdout, bytes) else stdout
            stderr = stderr.decode() if isinstance(stderr, bytes) else stderr
            stderr += '\nTrial timed out. No automatic request retry was performed.\n'
            code = 124
        (output / (name + '.stdout')).write_text(stdout)
        (output / (name + '.stderr')).write_text(stderr)
        report['checks'].append({'name': name, 'command': [str(x) for x in command],
                                 'cwd': str(cwd), 'exit_code': code,
                                 'elapsed_s': round(time.monotonic() - started, 2)})
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'{name}: exit {code}', flush=True)
        return code == 0

    doctor = check('doctor', [sys.executable, '-m', 'prosaic_runtime.cli', 'doctor',
                              '--config', config_path, '--profile', args.profile], runtime)
    if doctor:
        if not (args.ts_baseline or args.direct_read_only):
            check('runtime-smoke', [sys.executable, '-m', 'prosaic_runtime.cli', 'smoke', '--live',
                               '--config', config_path, '--profile', args.profile, '--events'], runtime, 420)
        for name, workflow, request in [('single', 'single.yml', 'request.json'),
                                        ('read-only', 'read-only.yml', 'read-request.json'),
                                        ('staged-read', 'staged-read.yml', 'read-request.json'),
                                        ('preloaded', 'preloaded-evidence.yml', 'read-request.json')]:
            if (args.ts_baseline or args.direct_read_only) and name != 'read-only':
                continue
            check('harness-' + name, [sys.executable, ROOT / 'scripts/audit_live_harness.py',
                  output / ('harness-' + name + '.requests.json'), harness / 'examples/run_workflow.py',
                  harness / 'examples' / workflow, '--config', config_path,
                  '--checks', harness / 'examples/checks.py',
                  '--input', harness / 'examples' / request,
                  '--run-dir', output / ('harness-' + name)], harness)
    report['success'] = doctor and all(c['exit_code'] == 0 for c in report['checks'])
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)
    return 0 if report['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
