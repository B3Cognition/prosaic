"""Build real clean-source candidate metadata before installing the SDK train."""
from email.parser import BytesParser
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tomllib
import zipfile


def test_clean_core_wheel_uses_public_distribution_family(tmp_path):
    root = Path(__file__).resolve().parents[1]
    revision = os.environ.get('PROSAIC_RELEASE_REF', 'HEAD')
    assert not revision.startswith('-')
    archive = subprocess.check_output(['git', 'archive', '--format=tar', revision], cwd=root)
    source = tmp_path / 'source'
    source.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as files:
        files.extractall(source, filter='data')
    distributions = tmp_path / 'dist'
    result = subprocess.run([sys.executable, '-m', 'build', '--wheel', '--no-isolation',
                             '--outdir', str(distributions), str(source)],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    wheels = list(distributions.glob('*.whl'))
    assert len(wheels) == 1
    with zipfile.ZipFile(wheels[0]) as wheel:
        metadata_path = next(name for name in wheel.namelist() if name.endswith('.dist-info/METADATA'))
        metadata = BytesParser().parsebytes(wheel.read(metadata_path))
        assert metadata['Name'] == 'b3-prosaic'
        version = tomllib.loads((root / 'pyproject.toml').read_text())['project']['version']
        assert metadata['Version'] == version
        assert all('git+' not in value and ' @ ' not in value
                   for value in metadata.get_all('Requires-Dist', []))
        assert 'prosaic/__init__.py' in wheel.namelist()
        assert f"__version__ = '{version}'".encode() in wheel.read('prosaic/__init__.py')
        assert b'prosaic = prosaic.cli:main' in wheel.read(
            metadata_path.replace('METADATA', 'entry_points.txt'))
