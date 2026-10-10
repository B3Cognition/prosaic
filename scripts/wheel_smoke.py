"""Run with the installed wheel's Python; deliberately hide Node from PATH."""
import json
from importlib import metadata
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import prosaic


def main():
    executable = Path(sys.executable).parent / 'prosaic'
    environment = {**os.environ, 'PATH': str(executable.parent), 'NO_COLOR': '1'}
    assert shutil.which('node', path=environment['PATH']) is None
    assert 'site-packages' in str(Path(prosaic.__file__).resolve()), prosaic.__file__
    installed = {distribution.metadata['Name'].lower().replace('_', '-')
                 for distribution in metadata.distributions()}
    assert 'b3-prosaic' in installed and 'prosaic' not in installed, installed
    assert metadata.version('b3-prosaic') == prosaic.__version__
    assert metadata.packages_distributions()['prosaic'] == ['b3-prosaic']
    with tempfile.TemporaryDirectory(prefix='prosaic-wheel-') as temporary:
        root = Path(temporary)
        source = root / '.prosaic/commands/greet.md'
        source.parent.mkdir(parents=True)
        source.write_text('---\ndescription: Greetings\n---\nHello $ARGUMENTS\n')

        def run(*arguments):
            result = subprocess.run([str(executable), *arguments], cwd=root,
                                    env=environment, text=True, capture_output=True)
            assert result.returncode == 0, (arguments, result.stdout, result.stderr)
            return result.stdout

        assert 'prosaic' in run('--help')
        assert run('--version').strip() == prosaic.__version__
        assert json.loads(run('tools')) == {'schema_version': 1, 'tools': []}
        inspection = json.loads(run('inspect', 'commands/greet.md'))
        assert inspection['id'] == 'commands/greet.md', inspection
        resolution = json.loads(run('resolve', 'commands/greet.md', '--target', 'claude-code'))
        assert resolution['artifactId'] == 'commands/greet.md', resolution
        report = json.loads(run('validate', '--json', '--strict', '--targets', 'claude-code'))
        assert report['schemaVersion'] == 1 and report['valid'], report
        assert prosaic.validate_project(root, {'targets': []})['valid']
        assert not (root / '.prosaic-operation.lock').exists()
        run('apply', '--targets', 'claude-code', '--dry-run')
        assert not (root / '.prosaic-manifest.json').exists()
        run('apply', '--targets', 'claude-code')
        assert (root / '.claude/commands/greet.md').exists()
        run('apply', '--targets', 'claude-code')
        run('import', '.claude/commands', '--format', 'claude-code', '--dry-run')
        run('revert', '--targets', 'claude-code')
        assert not (root / '.claude/commands/greet.md').exists()
    print(json.dumps({'module': prosaic.__file__, 'node_on_path': False,
                      'checks': ['help', 'version', 'tools', 'inspect', 'resolve', 'validate', 'dry-run', 'apply',
                                 'apply-noop', 'import-dry-run', 'revert']}, indent=2))


if __name__ == '__main__':
    main()
