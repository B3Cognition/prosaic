"""Exercise the public release tool with committed synthetic packages."""
import importlib.util
import io
import json
from pathlib import Path
import hashlib
import base64
import subprocess
import sys
import tarfile
import zipfile

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/release_artifacts.py'


@pytest.fixture
def release_tool():
    spec = importlib.util.spec_from_file_location('release_artifacts', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def package_repo(tmp_path):
    repo = tmp_path / 'repo'
    repo.mkdir()
    files = {
        'pyproject.toml': '''[build-system]
requires = ["setuptools>=77"]
build-backend = "setuptools.build_meta"
[project]
name = "b3-release-fixture"
version = "1.0.0"
requires-python = ">=3.11"
license = "Apache-2.0"
license-files = ["LICENSE", "NOTICE"]
[tool.setuptools.packages.find]
where = ["src"]
''',
        'src/release_fixture/__init__.py': "__version__ = '1.0.0'\n",
        'LICENSE': 'Synthetic license fixture\n',
        'NOTICE': 'Synthetic notice fixture\n',
        'MANIFEST.in': 'recursive-include docs *.md\n',
        'docs/public.md': 'Public fixture\n',
    }
    for name, content in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    for arguments in [('init', '-q'), ('add', '.'),
                      ('-c', 'user.name=Release Fixture', '-c',
                       'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')]:
        subprocess.run(['git', *arguments], cwd=repo, check=True,
                       capture_output=True)
    (repo / 'docs/private-untracked.md').write_text('Private untracked fixture\n')
    # Tracked working-tree modifications are excluded too.
    (repo / 'src/release_fixture/__init__.py').write_text("__version__ = '9.9.9'\n")
    return repo


@pytest.fixture
def built_release(release_tool, package_repo, tmp_path):
    output = tmp_path / 'release'
    receipt = release_tool.build_release(
        package_repo, 'HEAD', output, {'b3-release-fixture': '1.0.0'})
    return output, receipt


def test_build_uses_committed_source_only(release_tool, built_release):
    output, receipt = built_release
    assert receipt['version'] == 1
    assert len(receipt['source_commit']) == 40
    assert 'qualification' not in receipt  # A build is not test evidence.
    assert not (output / 'source/docs/private-untracked.md').exists()
    assert "'1.0.0'" in (output / 'source/src/release_fixture/__init__.py').read_text()
    assert len(receipt['artifacts']) == 2
    release_tool.verify_receipt(output / 'artifacts', receipt['source_commit'])
    with tarfile.open(next((output / 'artifacts').glob('*.tar.gz'))) as archive:
        assert not any('private-untracked' in name for name in archive.getnames())


@pytest.mark.parametrize('name', ['../escape', '/escape', 'a/../../escape',
                                'a\\escape', 'a//escape', 'a/./escape', 'C:/escape'])
def test_archive_paths_fail_closed(release_tool, name):
    archive_bytes = io.BytesIO()
    with tarfile.open(fileobj=archive_bytes, mode='w') as archive:
        info = tarfile.TarInfo(name)
        info.size = 1
        archive.addfile(info, io.BytesIO(b'x'))
    with pytest.raises(release_tool.ReleaseError):
        release_tool.tar_contents(archive_bytes.getvalue())


@pytest.mark.parametrize('kind', [tarfile.SYMTYPE, tarfile.LNKTYPE])
def test_archive_links_fail_closed(release_tool, kind):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w') as archive:
        info = tarfile.TarInfo('link')
        info.type, info.linkname = kind, 'file'
        archive.addfile(info)
    with pytest.raises(release_tool.ReleaseError):
        release_tool.tar_contents(buffer.getvalue())


@pytest.mark.parametrize('change', ['metadata', 'payload', 'unexpected', 'license', 'version'])
def test_wheel_audit_rejects_mutation(release_tool, built_release, change):
    output, _ = built_release
    wheel = next((output / 'artifacts').glob('*.whl'))
    with zipfile.ZipFile(wheel) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    metadata = next(name for name in entries if name.endswith('/METADATA'))
    if change == 'metadata':
        entries[metadata] = entries[metadata].replace(b'b3-release-fixture', b'foreign-project')
    elif change == 'payload':
        entries['release_fixture/__init__.py'] += b'raise RuntimeError("changed")\n'
    elif change == 'unexpected':
        entries['unexpected.py'] = b'print("foreign payload")\n'
    elif change == 'license':
        del entries[next(name for name in entries if name.endswith('/licenses/LICENSE'))]
    else:
        entries['release_fixture/__init__.py'] = b"__version__ = '8.0.0'\n"
    with zipfile.ZipFile(wheel, 'w') as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    with pytest.raises(release_tool.ReleaseError):
        release_tool.audit_artifacts(output / 'source', output / 'artifacts',
                                     {'b3-release-fixture': '1.0.0'})


def test_wheel_cannot_inject_an_executable_entry_point(release_tool, built_release):
    output, _ = built_release
    wheel = next((output / 'artifacts').glob('*.whl'))
    with zipfile.ZipFile(wheel) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    info = next(name.rsplit('/', 1)[0] for name in entries if name.endswith('/METADATA'))
    entries[info + '/entry_points.txt'] = b'[console_scripts]\ninjected = release_fixture:attack\n'
    # Regenerate RECORD so payload and entry-point audits must do their own work.
    records = []
    for name, content in entries.items():
        if name.endswith('/RECORD'):
            records.append(name + ',,\n')
        else:
            sha = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b'=').decode()
            records.append(f'{name},sha256={sha},{len(content)}\n')
    entries[info + '/RECORD'] = ''.join(records).encode()
    with zipfile.ZipFile(wheel, 'w') as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    with pytest.raises(release_tool.ReleaseError):
        release_tool.audit_artifacts(output / 'source', output / 'artifacts',
                                     {'b3-release-fixture': '1.0.0'})


def test_same_version_different_bytes_cannot_be_reused(release_tool, built_release):
    output, receipt = built_release
    release_tool.check_existing(receipt, receipt)
    existing = json.loads(json.dumps(receipt))
    existing['artifacts'][0]['sha256'] = '0' * 64
    with pytest.raises(release_tool.ReleaseError):
        release_tool.check_existing(receipt, existing)


@pytest.mark.parametrize('change', ['source', 'unexpected', 'metadata'])
def test_sdist_audit_rejects_mutation(release_tool, built_release, change):
    output, _ = built_release
    sdist = next((output / 'artifacts').glob('*.tar.gz'))
    entries = release_tool.tar_contents(sdist.read_bytes())
    prefix = next(iter(entries)).split('/')[0]
    if change == 'source':
        entries[prefix + '/src/release_fixture/__init__.py'] += b'# modified\n'
    elif change == 'unexpected':
        entries[prefix + '/credentials.json'] = b'{"synthetic":true}'
    else:
        entries[prefix + '/PKG-INFO'] = entries[prefix + '/PKG-INFO'].replace(b'1.0.0', b'2.0.0')
    with tarfile.open(sdist, 'w:gz') as archive:
        for name, content in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
    with pytest.raises(release_tool.ReleaseError):
        release_tool.audit_artifacts(output / 'source', output / 'artifacts',
                                     {'b3-release-fixture': '1.0.0'})


def test_publication_rechecks_downloaded_index_bytes(release_tool, built_release):
    output, receipt = built_release
    responses = {}
    files = []
    for item in receipt['artifacts']:
        url = 'https://files.pythonhosted.org/' + item['filename']
        responses[url] = (output / 'artifacts' / item['filename']).read_bytes()
        files.append({'filename': item['filename'], 'digests': {'sha256': item['sha256']},
                      'url': url})
    responses['https://pypi.org/pypi/b3-release-fixture/1.0.0/json'] = json.dumps({'urls': files}).encode()
    fetch = lambda url: responses.get(url)
    assert release_tool.check_index(output / 'artifacts', receipt['source_commit'],
                                    fetch=fetch) == 'already_published'
    responses[files[0]['url']] += b'changed'
    with pytest.raises(release_tool.ReleaseError):
        release_tool.check_index(output / 'artifacts', receipt['source_commit'], fetch=fetch)
    assert release_tool.check_index(output / 'artifacts', receipt['source_commit'],
                                    allow_missing=True, fetch=lambda url: None) == 'publish_required'
    with pytest.raises(release_tool.ReleaseError):
        release_tool.check_index(output / 'artifacts', receipt['source_commit'],
                                 fetch=lambda url: None)


def test_verified_artifacts_detect_missing_extra_and_changed_bytes(release_tool, built_release):
    output, receipt = built_release
    directory = output / 'artifacts'
    wheel = next(directory.glob('*.whl'))
    original = wheel.read_bytes()
    wheel.write_bytes(original + b'changed')
    with pytest.raises(release_tool.ReleaseError):
        release_tool.verify_receipt(directory, receipt['source_commit'])
    wheel.write_bytes(original)
    foreign = directory / 'foreign.whl'
    foreign.write_bytes(b'foreign')
    with pytest.raises(release_tool.ReleaseError):
        release_tool.verify_receipt(directory, receipt['source_commit'])
    foreign.unlink()
    wheel.unlink()
    with pytest.raises(release_tool.ReleaseError):
        release_tool.verify_receipt(directory, receipt['source_commit'])


def test_qualification_requires_success_and_same_bytes(release_tool, built_release):
    output, receipt = built_release
    directory = output / 'artifacts'
    commit = receipt['source_commit']
    with pytest.raises(release_tool.ReleaseError):
        release_tool.require_qualification(directory, commit, ['synthetic'])
    with pytest.raises(release_tool.ReleaseError):
        release_tool.qualify(directory, commit, 'synthetic',
                             [sys.executable, '-c', 'raise SystemExit(2)'])
    release_tool.qualify(directory, commit, 'synthetic', [sys.executable, '-c', 'pass'])
    release_tool.require_qualification(directory, commit, ['synthetic'])
    wheel = next(directory.glob('*.whl'))
    wheel.write_bytes(wheel.read_bytes() + b'mutation')
    with pytest.raises(release_tool.ReleaseError):
        release_tool.require_qualification(directory, commit, ['synthetic'])
