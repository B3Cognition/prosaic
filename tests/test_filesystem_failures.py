"""Filesystem failures must not masquerade as intentional source deletion."""
from contextlib import contextmanager
import errno
import os
from pathlib import Path
import stat

import pytest

from prosaic import core, filesystem
from prosaic.lifecycle import apply
from prosaic.packages import deploy_package


CLI = {'targets': ['claude-code']}


def canonical_project(root):
    source = root / '.prosaic/commands/nested/check.md'
    source.parent.mkdir(parents=True)
    source.write_text('---\ndescription: Check\n---\nOriginal instructions\n')
    apply(root, CLI)
    return source, root / '.claude/commands/check.md'


def package_project(root):
    source = root / 'source/bin/nested/tool'
    source.parent.mkdir(parents=True)
    source.write_bytes(b'original executable\x00')
    (root / 'prosaic.config.yaml').write_text(
        'packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: deployed\n')
    deploy_package(root, 'pkg')
    return source, root / 'deployed/bin/nested/tool'


def mutation_snapshot(root, output):
    return (output.read_bytes(), (root / '.prosaic-manifest.json').read_bytes(),
            (root / '.prosaic-operation.lock').stat().st_ino)


@pytest.mark.parametrize('dry_run', [False, True])
def test_missing_canonical_root_preserves_selected_managed_outputs(tmp_path, dry_run):
    source, output = canonical_project(tmp_path)
    before = mutation_snapshot(tmp_path, output)
    (tmp_path / '.prosaic').rename(tmp_path / 'removed-canonical-source')
    with pytest.raises(FileNotFoundError):
        apply(tmp_path, CLI, dry_run=dry_run)
    assert mutation_snapshot(tmp_path, output) == before


def test_missing_canonical_root_without_selected_managed_outputs_remains_noop(tmp_path):
    assert apply(tmp_path, CLI)['empty'] is True
    source, output = canonical_project(tmp_path)
    before = mutation_snapshot(tmp_path, output)
    (tmp_path / '.prosaic').rename(tmp_path / 'removed-canonical-source')
    assert apply(tmp_path, {'targets': ['codex-cli']})['removed'] == 0
    assert mutation_snapshot(tmp_path, output) == before


@pytest.mark.parametrize('failure', ['directory', 'primary', 'vanished-primary'])
@pytest.mark.parametrize('dry_run', [False, True])
def test_apply_rejects_incomplete_source_without_reconciliation(tmp_path, monkeypatch, failure, dry_run):
    source, output = canonical_project(tmp_path)
    before = mutation_snapshot(tmp_path, output)
    if failure == 'directory':
        scandir = os.scandir

        def unreadable(directory):
            if Path(directory) == source.parent:
                raise PermissionError(errno.EACCES, 'source scan denied', str(directory))
            return scandir(directory)

        monkeypatch.setattr(core.os, 'scandir', unreadable)
    else:
        read = Path.read_bytes

        def unreadable(path):
            if path == source:
                error = FileNotFoundError if failure == 'vanished-primary' else PermissionError
                raise error(errno.ENOENT if failure == 'vanished-primary' else errno.EACCES,
                            'source read failed', str(path))
            return read(path)

        monkeypatch.setattr(Path, 'read_bytes', unreadable)
    with pytest.raises(OSError):
        apply(tmp_path, CLI, dry_run=dry_run)
    assert mutation_snapshot(tmp_path, output) == before
    assert not (tmp_path / '.prosaic-backups').exists()


@pytest.mark.parametrize('failure', ['directory', 'partial-directory', 'stat', 'read'])
@pytest.mark.parametrize('dry_run', [False, True])
def test_package_rejects_incomplete_source_before_staging(tmp_path, monkeypatch, failure, dry_run):
    source, output = package_project(tmp_path)
    before = mutation_snapshot(tmp_path, output)
    stage = tmp_path / '.prosaic-package-staging/pkg'
    sentinel = stage / 'previous-staging-evidence'
    sentinel.write_bytes(b'keep existing staging on scan failure')
    if failure in ('directory', 'partial-directory'):
        iterdir = Path.iterdir

        def unreadable(path):
            if path == source.parent:
                if failure == 'partial-directory':
                    yield source
                raise PermissionError(errno.EACCES, 'package scan denied', str(path))
            yield from iterdir(path)

        monkeypatch.setattr(Path, 'iterdir', unreadable)
    else:
        method = Path.stat if failure == 'stat' else Path.read_bytes

        def unreadable(path, *args, **kwargs):
            if path == source:
                raise PermissionError(errno.EACCES, 'package entry denied', str(path))
            return method(path, *args, **kwargs)

        monkeypatch.setattr(Path, 'stat' if failure == 'stat' else 'read_bytes', unreadable)
    with pytest.raises(OSError):
        deploy_package(tmp_path, 'pkg', dry_run=dry_run)
    assert mutation_snapshot(tmp_path, output) == before
    assert sentinel.read_bytes() == b'keep existing staging on scan failure'
    assert not (tmp_path / '.prosaic-backups').exists()


@pytest.mark.parametrize('operation', ['apply', 'package'])
def test_readable_source_deletion_and_empty_tree_still_reconcile(tmp_path, operation):
    source, output = (canonical_project if operation == 'apply' else package_project)(tmp_path)
    run = lambda: apply(tmp_path, CLI) if operation == 'apply' else deploy_package(tmp_path, 'pkg')
    sibling = source.with_name('second.md' if operation == 'apply' else 'second')
    sibling.write_bytes(source.read_bytes())
    assert run()['created'] == 1
    source.unlink()
    assert run()['removed'] == 1
    assert not output.exists()
    sibling.unlink()
    assert run()['removed'] == 1
    assert run()['removed'] == 0


@pytest.mark.parametrize('failure', ['partial-write', 'replace'])
def test_failed_generated_write_preserves_output_manifest_and_lock(tmp_path, monkeypatch, failure):
    source, output = canonical_project(tmp_path)
    before = mutation_snapshot(tmp_path, output)
    source.write_text('---\ndescription: Updated\n---\nReplacement instructions\n')
    content = apply(tmp_path, CLI, dry_run=True)['plan']['writes'][0]['content'].encode('utf-8')
    with monkeypatch.context() as patch:
        if failure == 'replace':
            replace = os.replace

            def fail_replace(src, dest):
                if Path(dest) == output.resolve():
                    raise OSError(errno.ENOSPC, 'replacement failed')
                return replace(src, dest)

            patch.setattr(filesystem.os, 'replace', fail_replace)
        else:
            write_bytes, fdopen = Path.write_bytes, os.fdopen

            def fail_direct(path, data):
                if path == output.resolve():
                    write_bytes(path, data[:7])
                    raise OSError(errno.ENOSPC, 'partial write failed')
                return write_bytes(path, data)

            @contextmanager
            def fail_atomic(descriptor, mode):
                with fdopen(descriptor, mode) as stream:
                    class PartialWriter:
                        def write(self, data):
                            if data == content:
                                stream.write(data[:7])
                                raise OSError(errno.ENOSPC, 'partial write failed')
                            return stream.write(data)
                    yield PartialWriter()

            patch.setattr(Path, 'write_bytes', fail_direct)
            patch.setattr(filesystem.os, 'fdopen', fail_atomic)
        with pytest.raises(OSError):
            apply(tmp_path, CLI)
    assert mutation_snapshot(tmp_path, output) == before
    assert list(output.parent.glob('.*.tmp-*')) == []
    assert apply(tmp_path, CLI)['overwritten'] == 1
    assert output.read_bytes() == content


@pytest.mark.skipif(os.name == 'nt', reason='POSIX permission modes')
def test_generated_replacement_preserves_existing_permission_mode(tmp_path):
    source, output = canonical_project(tmp_path)
    output.chmod(0o751)
    source.write_text('---\ndescription: Updated\n---\nReplacement instructions\n')
    assert apply(tmp_path, CLI)['overwritten'] == 1
    assert stat.S_IMODE(output.stat().st_mode) == 0o751


@pytest.mark.parametrize('operation', ['apply', 'package'])
def test_symlink_project_alias_keeps_backup_sequence_and_retention(tmp_path, operation):
    root = tmp_path / 'actual'
    source, output = (canonical_project if operation == 'apply' else package_project)(root)
    alias = tmp_path / 'alias'
    try:
        alias.symlink_to(root, target_is_directory=True)
    except OSError:
        pytest.skip('host does not permit directory symlinks')
    config = root / 'prosaic.config.yaml'
    config.write_text('backupRetention: 2\n' + (config.read_text() if config.exists() else ''))
    run = (lambda project: apply(project, CLI)) if operation == 'apply' else (
        lambda project: deploy_package(project, 'pkg'))
    prior = []
    for index, project in enumerate([alias, root, alias], start=1):
        prior.append(output.read_bytes())
        source.write_text(f'---\ndescription: Change {index}\n---\nUpdated {index}\n')
        assert run(project)['overwritten'] == 1
    backup_parent = root / '.prosaic-backups' / output.relative_to(root).parent
    backups = sorted(backup_parent.glob(output.name + '.bak.*'))
    assert [backup.name for backup in backups] == [output.name + '.bak.2', output.name + '.bak.3']
    assert [backup.read_bytes() for backup in backups] == prior[1:]
    assert list(output.parent.glob('*.bak.*')) == []
