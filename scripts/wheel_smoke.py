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
from prosaic import ontology


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
    distribution = metadata.distribution('b3-prosaic')
    assert Path(ontology.__file__).resolve() == distribution.locate_file('prosaic/ontology.py').resolve()
    fixture = Path(__file__).resolve().parents[1] / 'conformance-fixtures/catalogue-ontology/attachment.json'
    attachment = ontology.load_ontology(fixture)
    assert ontology.validate_ontology(attachment) == json.loads(fixture.read_bytes())
    try:
        ontology.validate_ontology({**attachment, 'schemaVersion': False})
    except ValueError as error:
        assert str(error) == 'Invalid ontology attachment'
    else:
        raise AssertionError('invalid ontology attachment was accepted')
    with tempfile.TemporaryDirectory(prefix='prosaic-wheel-') as temporary:
        root = Path(temporary)
        source = root / '.prosaic/commands/greet.md'
        source.parent.mkdir(parents=True)
        source.write_text('---\ndescription: Greetings\n---\nHello $ARGUMENTS\n')
        rule = root / '.prosaic/rules/infra.md'
        rule.parent.mkdir()
        rule.write_text('Use approved modules.\n')

        def run(*arguments, expected=0):
            result = subprocess.run([str(executable), *arguments], cwd=root,
                                    env=environment, text=True, capture_output=True)
            assert result.returncode == expected, (arguments, result.stdout, result.stderr)
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
        assert (root / '.claude/rules/infra.md').is_file()
        assert not (root / '.claude/infra.md').exists()
        run('apply', '--targets', 'claude-code')
        run('import', '.claude/commands', '--format', 'claude-code', '--dry-run')
        run('revert', '--targets', 'claude-code')
        assert not (root / '.claude/commands/greet.md').exists()
        root = root / 'native-project'
        (root / '.prosaic/rules').mkdir(parents=True)
        (root / '.prosaic/rules/infra.md').write_text('Use approved modules.\n')
        for name in ('first', 'second'):
            bundle = root / '.prosaic/skills' / name
            (bundle / 'references').mkdir(parents=True)
            (bundle / 'SKILL.md').write_text(
                f'---\nname: {name}\ndescription: Follow this workflow\n---\n[guide](references/guide.md)\n')
            (bundle / 'references/guide.md').write_text(name + '\n')
        (root / 'prosaic.config.yaml').write_text('outputContracts: native-v1\ntargets: [claude-code, agents-md]\n')
        local = b'# Local\r\nKeep this without a final newline.'
        (root / 'AGENTS.md').write_bytes(local)
        assert not json.loads(run('check', '--json', expected=1))['clean']
        assert not (root / '.prosaic-operation.lock').exists()
        run('apply')
        assert (root / '.claude/rules/infra.md').is_file()
        for name in ('first', 'second'):
            assert (root / f'.claude/skills/{name}/SKILL.md').is_file()
            assert (root / f'.claude/skills/{name}/references/guide.md').read_text() == name + '\n'
        assert json.loads(run('check', '--json'))['clean']
        assert prosaic.check_project(root)['clean']
        run('apply')
        run('revert')
        assert (root / 'AGENTS.md').read_bytes() == local
    print(json.dumps({'module': prosaic.__file__, 'node_on_path': False,
                      'checks': ['catalogue-ontology', 'help', 'version', 'tools', 'inspect', 'resolve', 'validate', 'dry-run', 'apply',
                                 'apply-noop', 'import-dry-run', 'revert', 'check', 'native-apply',
                                 'native-resource-isolation', 'native-check', 'native-revert-local-content',
                                 'fresh-project-native-default']}, indent=2))


if __name__ == '__main__':
    main()
