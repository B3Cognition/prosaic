import json
from pathlib import Path
import shutil
import subprocess
import sys
import os
import pytest
from prosaic.lifecycle import apply, revert
from prosaic.filesystem import GuardedFs, Manifest, ManifestError, ContainmentError, BackupManager

ORACLE = str(Path(__file__).resolve().parents[1] / '.reference/dist/index.js')

def oracle(operation, root, **kwargs):
    script = '''const p=require(process.argv[1]); const o=JSON.parse(process.argv[3]); o.projectRoot=process.argv[2];
    if(o.registrySpec){o.registry=new p.Registry(new p.StaticRegistrySource(o.registrySpec.descriptors,o.registrySpec.version));delete o.registrySpec;}
    if(o.themeSpec){o.theme=require(require('path').join(require('path').dirname(process.argv[1]),'cli/theme.js'))[o.themeSpec];delete o.themeSpec;}
    console.log(JSON.stringify(p[o.operation](o)));'''
    return json.loads(subprocess.check_output(['node', '-e', script, ORACLE, str(root), json.dumps({'operation': operation, **kwargs})]))

def normalize(value):
    if isinstance(value, bytes):
        return {'type': 'Buffer', 'data': list(value)}
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value

def fixture(root):
    (root / '.prosaic/commands').mkdir(parents=True)
    (root / '.prosaic/commands/greet.md').write_text('---\ndescription: Greetings\n---\nHello $ARGUMENTS\n')

def test_lifecycle_reference_reports_and_manifest(tmp_path):
    python_root, ts_root = tmp_path / 'py', tmp_path / 'ts'
    fixture(python_root)
    shutil.copytree(python_root, ts_root)
    cli = {'targets': ['claude-code']}
    for dry in (True, False, False):
        py = apply(python_root, cli=cli, dry_run=dry)
        ts = oracle('apply', ts_root, cli=cli, dryRun=dry)
        assert normalize(py) == ts
        if not dry:
            assert (python_root / '.prosaic-manifest.json').read_bytes() == (ts_root / '.prosaic-manifest.json').read_bytes()
    for dry in (True, False):
        assert revert(python_root, cli=cli, dry_run=dry) == oracle('revert', ts_root, cli=cli, dryRun=dry)

def test_corrupt_manifest_aborts_and_zero_targets_skip(tmp_path):
    fixture(tmp_path)
    (tmp_path / '.prosaic-manifest.json').write_text('{}')
    with pytest.raises(ManifestError):
        apply(tmp_path, {'targets': ['claude-code']})
    assert apply(tmp_path, {'targets': []})['zeroTargets'] is True

def test_containment_and_backup_retention(tmp_path):
    outside = tmp_path.parent / (tmp_path.name + '-outside')
    outside.mkdir()
    (tmp_path / 'escape').symlink_to(outside, target_is_directory=True)
    fs = GuardedFs(tmp_path)
    with pytest.raises(ContainmentError):
        fs.write_file('escape/new.txt', 'refused')
    fs.write_file('managed', b'old')
    backups = BackupManager(fs, 2)
    for _ in range(4):
        backups.backup(tmp_path / 'managed')
    assert [x['seq'] for x in backups.list_backups(tmp_path / 'managed')] == [3, 4]

def test_user_authored_file_guard_and_adoption(tmp_path):
    fixture(tmp_path)
    planned = apply(tmp_path, {'targets': ['claude-code']}, True)['plan']['writes'][0]
    dest = tmp_path / planned['path']
    dest.parent.mkdir(parents=True)
    dest.write_text('user-authored')
    report = apply(tmp_path, {'targets': ['claude-code']})
    assert report['created'] == 0
    assert dest.read_text() == 'user-authored'
    dest.write_text(planned['content'])
    assert apply(tmp_path, {'targets': ['claude-code']})['unchanged'] == 1
    assert revert(tmp_path, {'targets': ['claude-code']})['removed'] == 1

def test_all_targets_reconciliation_and_backup_parity(tmp_path):
    py, ts = tmp_path / 'py', tmp_path / 'ts'
    fixture(py)
    for kind, name in [('rules', 'policy.md'), ('skills', 'SKILL.md'), ('subagents', 'helper.md')]:
        folder = py / '.prosaic' / kind
        folder.mkdir()
        (folder / name).write_text('---\nname: Sample\ndescription: Example\n---\nUseful instructions\n')
    shutil.copytree(py, ts)
    for dry in (True, False, False):
        assert normalize(apply(py, dry_run=dry)) == oracle('apply', ts, dryRun=dry)
    for root in (py, ts):
        (root / '.prosaic/commands/greet.md').write_text('---\ndescription: Revised\n---\nUpdated $ARGUMENTS\n')
        (root / '.prosaic/subagents/helper.md').unlink()
    assert normalize(apply(py)) == oracle('apply', ts)
    for path in ts.rglob('*'):
        if path.is_file():
            assert (py / path.relative_to(ts)).read_bytes() == path.read_bytes()
    assert revert(py) == oracle('revert', ts)

@pytest.mark.parametrize('raw', ['', '{', '{ not valid json', 'not json', '{"entries":}',
    '{"entries":[]', '{"entries":[],}', '[1,]', '{"a":1}tail', 'undefined', 'NaN', 'Infinity',
    '\ufeff{}', '{"a":"\\q"}', '{"a":01}', '{"a":tru}', '{"a":"hi\nthere"}', '[',
    'true false', '{"a" 1}', '{"a":1 "b":2}', 'nul', 'tru', 'fals', '-', '1.', '1e', '1e+',
    '[1', '{"a":', '{"a"', '{"a":"hello', '"a', '"\\uXYZW"', '[true false]', '   ',
    'nulx', '{"abcdefghijklmnopqrstuvxyz": x}', '[1,2,3,4,5,6,7,8,9,10,11,12,13,x]',
    '{\n  bad\n}', '"\\u12"', '[1, ', '{"a":1,', '-01', '01', 'null\x00', '{}\rX',
    '{}\r\nX', '{"x":"\\', '[truX]', '[Nu]', '"\\u123', '"\\\n"', '{"😀": x}',
    '{"entries":NaN}', '{"entries":Infinity}'])
def test_malformed_manifest_diagnostic_parity(tmp_path, raw):
    (tmp_path / '.prosaic-manifest.json').write_text(raw)
    with pytest.raises(ManifestError) as py_error:
        Manifest.load(GuardedFs(tmp_path))
    script = 'const {Manifest}=require(process.argv[1]+"/manifest/manifest.js");const {GuardedFs}=require(process.argv[1]+"/write/guarded-fs.js");try{Manifest.load(new GuardedFs(process.argv[2]))}catch(e){console.log(JSON.stringify({message:e.message,kind:e.kind}))}'
    ts = json.loads(subprocess.check_output(['node', '-e', script, str(Path(ORACLE).parent), str(tmp_path)]))
    assert str(py_error.value) == ts['message']
    assert py_error.value.kind == ts['kind']

def test_unreadable_manifest_directory_diagnostic(tmp_path):
    (tmp_path / '.prosaic-manifest.json').mkdir()
    with pytest.raises(ManifestError, match='^Manifest unreadable: EISDIR: illegal operation on a directory, read$'):
        Manifest.load(GuardedFs(tmp_path))

def test_broken_symlink_escape_is_refused_before_creation(tmp_path):
    outside_file = tmp_path.parent / (tmp_path.name + '-private-new')
    (tmp_path / 'broken').symlink_to(outside_file)
    fs = GuardedFs(tmp_path)
    with pytest.raises(ContainmentError):
        fs.write_file('broken', b'never outside')
    assert not outside_file.exists()

def test_containing_symlink_and_zero_retention(tmp_path):
    (tmp_path / 'real').mkdir()
    (tmp_path / 'alias').symlink_to(tmp_path / 'real', target_is_directory=True)
    fs = GuardedFs(tmp_path)
    fs.write_file('alias/file', b'contained')
    assert (tmp_path / 'real/file').read_bytes() == b'contained'
    manager = BackupManager(fs, 0)
    manager.backup(tmp_path / 'real/file')
    assert manager.list_backups(tmp_path / 'real/file') == []

@pytest.mark.parametrize('raw', ['{ not valid json', '{"a":1}tail', '{"entries":[],"integrity":"tampered"}', '{}', None])
@pytest.mark.parametrize('command', [['apply', '--targets', 'claude-code'], ['revert'], ['package', 'deploy', 'pkg'], ['package', 'revert', 'pkg']])
def test_negative_manifest_exact_cli_contract(tmp_path, raw, command):
    fixture(tmp_path)
    (tmp_path / 'package-source').mkdir()
    (tmp_path / 'prosaic.config.yaml').write_text('packages:\n  - id: pkg\n    sourceRoot: package-source\n    destinationRoot: package-dest\n')
    manifest = tmp_path / '.prosaic-manifest.json'
    if raw is None:
        manifest.mkdir()
    else:
        manifest.write_text(raw)
    python = subprocess.run([sys.executable, '-m', 'prosaic', *command], cwd=tmp_path, capture_output=True, text=True)
    typescript = subprocess.run(['node', str(Path(ORACLE).parent / 'cli/index.js'), *command], cwd=tmp_path, capture_output=True, text=True)
    assert (python.returncode, python.stdout, python.stderr) == (typescript.returncode, typescript.stdout, typescript.stderr)

@pytest.mark.skipif(os.name == 'nt' or os.geteuid() == 0, reason='POSIX unprivileged file permissions required')
def test_unreadable_manifest_permission_exact_cli(tmp_path):
    manifest = tmp_path / '.prosaic-manifest.json'
    manifest.write_text('{}')
    manifest.chmod(0)
    try:
        python = subprocess.run([sys.executable, '-m', 'prosaic', 'revert'], cwd=tmp_path, capture_output=True, text=True)
        typescript = subprocess.run(['node', str(Path(ORACLE).parent / 'cli/index.js'), 'revert'], cwd=tmp_path, capture_output=True, text=True)
        assert (python.returncode, python.stdout, python.stderr) == (typescript.returncode, typescript.stdout, typescript.stderr)
        assert 'Manifest unreadable: EACCES: permission denied, open' in python.stderr
    finally:
        manifest.chmod(0o600)

def custom_registry():
    from prosaic.registry import Registry, StaticRegistrySource, get_target
    descriptor = get_target('claude-code')
    descriptor.update(id='custom-target', destinationDir='generated [special]')
    descriptor['slots'] = {kind: {'dir': 'generated [special]/' + kind, 'extension': '.md'} for kind in ('command', 'skill', 'agent')}
    version = {'version': '9.8.7-custom', 'rulerParityRef': 'test@1', 'parityBaseline': 1}
    spec = {'descriptors': [descriptor], 'version': version}
    return Registry(StaticRegistrySource([descriptor], version)), spec

def test_injected_registry_global_config_and_styled_previews(tmp_path):
    from prosaic.cli import theme
    py, ts = tmp_path / 'py', tmp_path / 'ts'
    fixture(py)
    (py / '.prosaic').rename(py / 'alternate-source')
    (py / 'alternate-source/commands/remove.md').write_text('---\ndescription: To remove\n---\nObsolete\n')
    shutil.copytree(py, ts)
    global_dir = tmp_path / 'global'
    global_dir.mkdir()
    (global_dir / 'prosaic.config.yaml').write_text('source: alternate-source\ntargets: [custom-target]\n')
    registry, spec = custom_registry()
    for dry in (True, False):
        python = apply(py, dry_run=dry, registry=registry, global_dir=global_dir, theme=theme(True))
        typescript = oracle('apply', ts, dryRun=dry, registrySpec=spec, globalDir=str(global_dir), themeSpec='styledTheme')
        assert normalize(python) == typescript
    assert json.loads((py / '.prosaic-manifest.json').read_text())['registryVersion'] == '9.8.7-custom'
    assert (py / '.prosaic-manifest.json').read_bytes() == (ts / '.prosaic-manifest.json').read_bytes()
    for root in (py, ts):
        (root / 'alternate-source/commands/remove.md').unlink()
        (root / 'alternate-source/commands/greet.md').write_text('---\ndescription: Changed\n---\nNew\n')
    assert normalize(apply(py, dry_run=True, registry=registry, global_dir=global_dir, theme=theme(True))) == oracle(
        'apply', ts, dryRun=True, registrySpec=spec, globalDir=str(global_dir), themeSpec='styledTheme')
    assert revert(py, dry_run=True, global_dir=global_dir, theme=theme(True)) == oracle(
        'revert', ts, dryRun=True, globalDir=str(global_dir), themeSpec='styledTheme')
