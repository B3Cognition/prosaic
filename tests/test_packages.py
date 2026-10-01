import json
import os
import shutil
import pytest
from prosaic.packages import deploy_package, revert_package, enumerate_package_source, PackageValidationError, UnknownPackageError
from prosaic.filesystem import ManifestError, GuardedFs
from test_lifecycle import oracle, normalize, custom_registry

def package_fixture(root):
    source = root / 'source'
    (source / 'commands').mkdir(parents=True)
    (source / 'commands/raw.md').write_bytes(b'---\nanything: untouched\n---\n$ARGUMENTS\n')
    (source / 'bin').mkdir()
    (source / 'bin/tool').write_bytes(b'\x00\xff\x01opaque')
    os.chmod(source / 'bin/tool', 0o751)
    (root / 'prosaic.config.yaml').write_text('packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: deployed\n')

def test_package_reference_and_recovery(tmp_path):
    py, ts = tmp_path / 'py', tmp_path / 'ts'
    package_fixture(py)
    shutil.copytree(py, ts)
    for dry in (True, False, False):
        assert normalize(deploy_package(py, 'pkg', dry_run=dry)) == oracle('deployPackage', ts, packageId='pkg', dryRun=dry)
    assert (py / 'deployed/bin/tool').stat().st_mode == (ts / 'deployed/bin/tool').stat().st_mode
    for root in (py, ts):
        (root / 'source/bin/tool').write_bytes(b'new\x00binary')
        (root / 'source/commands/raw.md').unlink()
    assert normalize(deploy_package(py, 'pkg')) == oracle('deployPackage', ts, packageId='pkg')
    assert (py / '.prosaic-manifest.json').read_bytes() == (ts / '.prosaic-manifest.json').read_bytes()
    for dry in (True, False):
        assert revert_package(py, 'pkg', dry_run=dry) == oracle('revertPackage', ts, packageId='pkg', dryRun=dry)

def test_package_unknown_and_corrupt_manifest(tmp_path):
    package_fixture(tmp_path)
    with pytest.raises(UnknownPackageError):
        revert_package(tmp_path, 'missing')
    (tmp_path / '.prosaic-manifest.json').write_text('{}')
    with pytest.raises(ManifestError):
        deploy_package(tmp_path, 'pkg')

def test_package_symlink_escape_and_foreign_path(tmp_path):
    package_fixture(tmp_path)
    outside = tmp_path.parent / (tmp_path.name + '-outside')
    outside.mkdir()
    (outside / 'private').write_text('private')
    (tmp_path / 'source/escape').symlink_to(outside, target_is_directory=True)
    enumeration = enumerate_package_source(tmp_path / 'source')
    assert enumeration['warnings'][0]['kind'] == 'package-path-rejected'
    (tmp_path / 'deployed/bin').mkdir(parents=True)
    (tmp_path / 'deployed/bin/tool').write_text('foreign')
    report = deploy_package(tmp_path, 'pkg')
    assert report['created'] == 1
    assert (tmp_path / 'deployed/bin/tool').read_text() == 'foreign'

def test_package_validation_precedes_mutation(tmp_path):
    package_fixture(tmp_path)
    (tmp_path / 'prosaic.config.yaml').write_text('packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: source/nested\n')
    with pytest.raises(PackageValidationError, match='overlaps its own source'):
        deploy_package(tmp_path, 'pkg')
    assert not (tmp_path / 'source/nested').exists()

def test_failed_staging_leaves_destination_and_rerun_recovers(tmp_path, monkeypatch):
    package_fixture(tmp_path)
    deploy_package(tmp_path, 'pkg')
    original = (tmp_path / 'deployed/bin/tool').read_bytes()
    (tmp_path / 'source/bin/tool').write_bytes(b'updated')
    write = GuardedFs.write_file_atomic
    def fail_stage(self, target, content):
        if str(target).startswith('.prosaic-package-staging/'):
            raise OSError('simulated staging interruption')
        return write(self, target, content)
    with monkeypatch.context() as context:
        context.setattr(GuardedFs, 'write_file_atomic', fail_stage)
        with pytest.raises(OSError, match='interruption'):
            deploy_package(tmp_path, 'pkg')
    assert (tmp_path / 'deployed/bin/tool').read_bytes() == original
    stage = tmp_path / '.prosaic-package-staging/pkg'
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'stale').write_text('stale')
    assert deploy_package(tmp_path, 'pkg')['overwritten'] == 1
    assert not (stage / 'stale').exists()
    assert (tmp_path / 'deployed/bin/tool').read_bytes() == b'updated'

def test_package_isolation_with_shared_manifest(tmp_path):
    package_fixture(tmp_path)
    (tmp_path / 'other-source').mkdir()
    (tmp_path / 'other-source/owned').write_text('other')
    (tmp_path / 'prosaic.config.yaml').write_text('packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: deployed\n  - id: other\n    sourceRoot: other-source\n    destinationRoot: other-dest\n')
    deploy_package(tmp_path, 'pkg')
    deploy_package(tmp_path, 'other')
    revert_package(tmp_path, 'pkg')
    assert (tmp_path / 'other-dest/owned').read_text() == 'other'

def test_mid_commit_recovery_adopts_identical_created_files(tmp_path, monkeypatch):
    package_fixture(tmp_path)
    move = GuardedFs.move_file_atomic
    count = 0
    def interrupt_commit(self, source, dest):
        nonlocal count
        count += 1
        if count == 2:
            raise OSError('simulated commit interruption')
        move(self, source, dest)
    with monkeypatch.context() as context:
        context.setattr(GuardedFs, 'move_file_atomic', interrupt_commit)
        with pytest.raises(OSError, match='interruption'):
            deploy_package(tmp_path, 'pkg')
    assert not (tmp_path / '.prosaic-manifest.json').exists()
    report = deploy_package(tmp_path, 'pkg')
    assert report['created'] == 1 and report['unchanged'] == 1
    assert revert_package(tmp_path, 'pkg')['removed'] == 2

def test_absolute_package_destination_remains_staged(tmp_path):
    from prosaic.packages import staging_path_for
    package_fixture(tmp_path)
    dest = tmp_path / 'absolute-dest'
    (tmp_path / 'prosaic.config.yaml').write_text(f'packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: {dest}\n')
    report = deploy_package(tmp_path, 'pkg')
    assert report['created'] == 2
    assert staging_path_for('pkg', str(dest)).startswith('.prosaic-package-staging/pkg/')
    assert (dest / 'bin/tool').read_bytes() == b'\x00\xff\x01opaque'

def test_broken_contained_source_link_warning_parity(tmp_path):
    package_fixture(tmp_path)
    (tmp_path / 'source/broken').symlink_to(tmp_path / 'source/missing')
    python = deploy_package(tmp_path, 'pkg', dry_run=True)
    typescript = oracle('deployPackage', tmp_path, packageId='pkg', dryRun=True)
    assert normalize(python) == typescript

def test_injected_registry_controls_package_overlap_and_manifest_version(tmp_path):
    py, ts = tmp_path / 'py', tmp_path / 'ts'
    package_fixture(py)
    # This overlaps a builtin's slot but is legal for the injected registry.
    (py / 'prosaic.config.yaml').write_text('packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: .claude/commands\n')
    shutil.copytree(py, ts)
    registry, spec = custom_registry()
    for dry in (True, False, False):
        assert normalize(deploy_package(py, 'pkg', dry_run=dry, registry=registry)) == oracle(
            'deployPackage', ts, packageId='pkg', dryRun=dry, registrySpec=spec)
    assert json.loads((py / '.prosaic-manifest.json').read_text())['registryVersion'] == '9.8.7-custom'
    assert (py / '.prosaic-manifest.json').read_bytes() == (ts / '.prosaic-manifest.json').read_bytes()
    with pytest.raises(PackageValidationError, match='registered render target'):
        deploy_package(py, 'pkg')
