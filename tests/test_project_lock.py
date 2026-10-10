"""Real process ownership and reserved coordination-inode regressions."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading

import pytest

from prosaic import apply, revert, deploy_package, revert_package
from prosaic.filesystem import GuardedFs, Manifest, sha256
from test_lifecycle import fixture
from test_packages import package_fixture


@contextmanager
def holding_process(root):
    source = '''import sys
from prosaic.locking import project_mutation_lock
with project_mutation_lock(sys.argv[1]):
    print("READY", flush=True)
    sys.stdin.buffer.read(1)
'''
    child = subprocess.Popen([sys.executable, '-c', source, str(root)],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    ready = queue.Queue()
    threading.Thread(target=lambda: ready.put(child.stdout.readline()), daemon=True).start()
    try:
        assert ready.get(timeout=10) == 'READY\n', child.stderr.read()
        yield child
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=10)
        for pipe in (child.stdin, child.stdout, child.stderr):
            pipe.close()


def tree_bytes(root):
    return {str(p.relative_to(root)): p.read_bytes()
            for p in root.rglob('*') if p.is_file()}


def project(root):
    fixture(root)
    package_fixture(root)
    apply(root, {'targets': ['claude-code']})
    deploy_package(root, 'pkg')


@pytest.mark.parametrize('operation', [
    lambda root: apply(root, {'targets': ['claude-code']}),
    lambda root: revert(root, {'targets': ['claude-code']}),
    lambda root: deploy_package(root, 'pkg'),
    lambda root: revert_package(root, 'pkg'),
], ids=['apply', 'revert', 'package-deploy', 'package-revert'])
def test_mutation_entrypoints_conflict_with_real_process(tmp_path, operation):
    from prosaic.locking import ProjectBusyError
    project(tmp_path)
    before = tree_bytes(tmp_path)
    with holding_process(tmp_path):
        with pytest.raises(ProjectBusyError):
            operation(tmp_path)
    assert tree_bytes(tmp_path) == before


def test_symlink_root_alias_shares_authority(tmp_path):
    from prosaic.locking import ProjectBusyError
    root = tmp_path / 'real'
    fixture(root)
    alias = tmp_path / 'alias'
    try:
        alias.symlink_to(root, target_is_directory=True)
    except OSError:
        pytest.skip('host does not permit directory symlinks')
    with holding_process(root):
        with pytest.raises(ProjectBusyError):
            apply(alias, {'targets': ['claude-code']})


def test_process_death_releases_lock_and_staging_recovers(tmp_path):
    project(tmp_path)
    (tmp_path / 'source/bin/tool').write_bytes(b'new-content')
    interrupted = tmp_path / '.prosaic-package-staging/pkg/deployed/bin/tool'
    interrupted.parent.mkdir(parents=True, exist_ok=True)
    interrupted.write_bytes(b'interrupted')
    with holding_process(tmp_path) as child:
        child.kill()
        child.wait(timeout=10)
    report = deploy_package(tmp_path, 'pkg')
    assert report['overwritten'] == 1
    assert (tmp_path / 'deployed/bin/tool').read_bytes() == b'new-content'
    assert (tmp_path / '.prosaic-operation.lock').is_file()
    apply(tmp_path, {'targets': ['claude-code']})


def test_other_projects_and_dry_runs_do_not_contend(tmp_path):
    root, other = tmp_path / 'owned', tmp_path / 'other'
    project(root)
    fixture(other)
    with holding_process(root):
        assert apply(other, {'targets': ['claude-code']})['created'] == 1
        assert apply(root, {'targets': ['claude-code']}, dry_run=True)['dryRun']
        assert revert(root, {'targets': ['claude-code']}, dry_run=True)['dryRun']
        assert deploy_package(root, 'pkg', dry_run=True)['dryRun']
        assert revert_package(root, 'pkg', dry_run=True)['dryRun']
        assert apply(root, {'targets': []})['zeroTargets']


def test_untouched_dry_run_zero_targets_and_invalid_package_create_no_metadata(tmp_path):
    from prosaic.packages import UnknownPackageError
    fixture(tmp_path)
    package_fixture(tmp_path)
    before = tree_bytes(tmp_path)
    apply(tmp_path, {'targets': ['claude-code']}, dry_run=True)
    deploy_package(tmp_path, 'pkg', dry_run=True)
    apply(tmp_path, {'targets': []})
    with pytest.raises(UnknownPackageError):
        deploy_package(tmp_path, 'missing')
    assert tree_bytes(tmp_path) == before


def test_zero_target_revert_is_read_only_without_lock(tmp_path):
    fs = GuardedFs(tmp_path)
    Manifest(fs).save()
    before = tree_bytes(tmp_path)
    assert revert(tmp_path, {'targets': []})['removed'] == 0
    assert tree_bytes(tmp_path) == before


@pytest.mark.parametrize('kind', ['symlink', 'directory', 'fifo'])
def test_unsafe_lock_path_fails_without_output_mutation(tmp_path, kind):
    from prosaic.locking import ProjectLockError
    fixture(tmp_path)
    lock = tmp_path / '.prosaic-operation.lock'
    if kind == 'directory':
        lock.mkdir()
    elif kind == 'fifo':
        if not hasattr(os, 'mkfifo'):
            pytest.skip('FIFO requires POSIX')
        os.mkfifo(lock)
    else:
        other = tmp_path / 'other'
        other.write_bytes(b'private')
        try:
            lock.symlink_to(other)
        except OSError:
            pytest.skip('host does not permit symlinks')
    with pytest.raises(ProjectLockError):
        apply(tmp_path, {'targets': ['claude-code']})
    assert not (tmp_path / '.prosaic-manifest.json').exists()
    assert not (tmp_path / '.claude').exists()


@pytest.mark.parametrize('method,args', [
    ('write_file', ('.prosaic-operation.lock', b'x')),
    ('write_file_atomic', ('.prosaic-operation.lock', b'x')),
    ('delete_file', ('.prosaic-operation.lock',)),
    ('copy_file', ('ordinary', '.prosaic-operation.lock')),
    ('move_file_atomic', ('ordinary', '.prosaic-operation.lock')),
    ('move_file_atomic', ('.prosaic-operation.lock', 'ordinary')),
    ('mkdirp', ('.prosaic-operation.lock',)),
    ('write_file', ('.prosaic-operation.lock/child', b'x')),
    ('remove_dir', ('.',)),
])
def test_all_mutators_reserve_coordination_inode(tmp_path, method, args):
    from prosaic.locking import project_mutation_lock, ProjectLockError
    fs = GuardedFs(tmp_path)
    fs.write_file('ordinary', b'original')
    with project_mutation_lock(tmp_path):
        inode = (tmp_path / '.prosaic-operation.lock').stat().st_ino
        with pytest.raises(ProjectLockError):
            getattr(fs, method)(*args)
        assert (tmp_path / '.prosaic-operation.lock').stat().st_ino == inode
        assert (tmp_path / 'ordinary').read_bytes() == b'original'


def test_guard_rejects_inode_alias_and_detects_replaced_held_path(tmp_path):
    from prosaic.locking import project_mutation_lock, ProjectLockError
    fs = GuardedFs(tmp_path)
    with pytest.raises(ProjectLockError):
        with project_mutation_lock(tmp_path):
            lock = tmp_path / '.prosaic-operation.lock'
            alias = tmp_path / 'alias'
            os.link(lock, alias)
            with pytest.raises(ProjectLockError):
                fs.write_file(alias, b'cannot overwrite inode')
            alias.unlink()
            lock.unlink()
            lock.write_bytes(b'replaced')
            fs.write_file('ordinary', b'must not write')
    assert not (tmp_path / 'ordinary').exists()


def test_atomic_temporary_file_cannot_overwrite_lock_alias(tmp_path, monkeypatch):
    from prosaic.locking import ProjectLockError
    from prosaic import filesystem
    lock = tmp_path / '.prosaic-operation.lock'
    lock.write_bytes(b'original-lock')
    temporary = tmp_path / f'.ordinary.tmp-{os.getpid()}-731'
    os.link(lock, temporary)
    monkeypatch.setattr(filesystem, '_counter', iter([731]))
    with pytest.raises(ProjectLockError):
        GuardedFs(tmp_path).write_file_atomic('ordinary', b'overwrite')
    assert lock.read_bytes() == b'original-lock'
    assert not (tmp_path / 'ordinary').exists()


@pytest.mark.parametrize('operation', ['apply', 'revert', 'deploy', 'package-revert'])
def test_old_manifest_cannot_delete_lock(tmp_path, operation):
    from prosaic.locking import ProjectLockError
    project(tmp_path)
    fs = GuardedFs(tmp_path)
    manifest = Manifest.load(fs)
    owner = 'pkg' if operation in ('deploy', 'package-revert') else 'claude-code'
    manifest.record(owner, '.prosaic-operation.lock', sha256(b''))
    manifest.save()
    before = (tmp_path / '.prosaic-manifest.json').read_bytes()
    with pytest.raises(ProjectLockError):
        {'apply': lambda: apply(tmp_path, {'targets': ['claude-code']}),
         'revert': lambda: revert(tmp_path, {'targets': ['claude-code']}),
         'deploy': lambda: deploy_package(tmp_path, 'pkg'),
         'package-revert': lambda: revert_package(tmp_path, 'pkg')}[operation]()
    assert (tmp_path / '.prosaic-operation.lock').exists()
    assert (tmp_path / '.prosaic-manifest.json').read_bytes() == before


def test_render_descriptor_cannot_adopt_or_replace_lock(tmp_path):
    from prosaic.locking import ProjectLockError
    from prosaic.registry import Registry, StaticRegistrySource, get_target
    fixture(tmp_path)
    descriptor = get_target('claude-code')
    descriptor['companions'] = [{'nameTemplate': '../../.prosaic-operation.lock', 'content': ''}]
    registry = Registry(StaticRegistrySource([descriptor], {'version': 'test'}))
    with pytest.raises(ProjectLockError):
        apply(tmp_path, {'targets': ['claude-code']}, registry=registry)
    assert not (tmp_path / '.prosaic-manifest.json').exists()


def test_cli_reports_busy_without_mutation(tmp_path):
    project(tmp_path)
    before = tree_bytes(tmp_path)
    with holding_process(tmp_path):
        result = subprocess.run([sys.executable, '-m', 'prosaic', 'apply',
                                 '--targets', 'claude-code'], cwd=tmp_path,
                                text=True, capture_output=True, timeout=10)
    assert result.returncode == 1 and 'busy' in result.stderr.lower()
    assert tree_bytes(tmp_path) == before
