"""Catalogue boundaries: discovery must never execute a manifest command."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
import yaml

MANIFEST = {
    'schema_version': 1, 'name': 'analyze_spec', 'description': 'Analyze a spec',
    'tool_version': '1.0', 'executable': 'does-not-exist', 'argv': ['{spec}', '--json'],
    'parameters': {'type': 'object', 'additionalProperties': False,
                   'properties': {'spec': {'type': 'string'}}, 'required': ['spec']},
    'path_parameters': {'spec': 'read'}, 'version_probe': ['--version'],
    'output_format': 'json', 'timeout_s': 30, 'max_output_bytes': 65536,
}

def run(root, *args):
    env = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[1] / 'src')}
    return subprocess.run([sys.executable, '-m', 'prosaic', 'tools', *args],
                          cwd=root, env=env, text=True, capture_output=True)

def write(root, name, manifest):
    tools = root / '.prosaic/tools'
    tools.mkdir(parents=True, exist_ok=True)
    (tools / name).write_text(yaml.safe_dump(manifest))
    return tools

def test_catalogue_discovers_sorted_yaml_without_executing(tmp_path):
    write(tmp_path, 'z.yml', MANIFEST)
    write(tmp_path, 'a.yaml', {**MANIFEST, 'name': 'other'})
    result = run(tmp_path, '--source', '.prosaic')
    assert result.returncode == 0, result.stderr
    assert result.stderr == ''
    report = json.loads(result.stdout)
    assert report['schema_version'] == 1
    assert [item['manifest']['name'] for item in report['tools']] == ['other', 'analyze_spec']
    assert report['tools'][1]['manifest'] == MANIFEST

def test_catalogue_missing_directory_is_empty(tmp_path):
    result = run(tmp_path)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {'schema_version': 1, 'tools': []}

def test_catalogue_yaml_matches_js_numeric_and_boolean_like_strings(tmp_path):
    tools = write(tmp_path, 'one.yml', MANIFEST)
    content = (tools / 'one.yml').read_text().replace('schema_version: 1', 'schema_version: 1.0')
    content = content.replace('description: Analyze a spec', 'description: yes')
    content = content.replace('max_output_bytes: 65536', 'max_output_bytes: 65536.0')
    (tools / 'one.yml').write_text(content + 'success_exit_codes: [0.0]\n')
    result = run(tmp_path)
    assert result.returncode == 0, result.stderr
    manifest = json.loads(result.stdout)['tools'][0]['manifest']
    assert manifest['description'] == 'yes'
    assert manifest['success_exit_codes'] == [0]

@pytest.mark.parametrize('change', [
    {'unexpected': True}, {'schema_version': True}, {'executable': '{spec}'},
    {'argv': ['--spec={spec}']}, {'argv': ['{unknown}']},
    {'path_parameters': {'other': 'read'}}, {'parameters': {'type': 'object'}},
    {'timeout_s': 0}, {'timeout_s': True}, {'max_output_bytes': 127},
    {'success_exit_codes': [256]}, {'pass_env': ['X', 'X']},
    {'version_contains': '1', 'version_probe': []},
    {'parameters': {'type': 'object', 'additionalProperties': False,
                    'properties': {'spec': {'type': 'number'}}, 'required': ['spec']}},
])
def test_catalogue_invalid_contracts_fail_closed_without_leaking_source(tmp_path, change):
    manifest = {**copy.deepcopy(MANIFEST), 'description': 'private-source-marker', **change}
    write(tmp_path, 'bad.yml', manifest)
    result = run(tmp_path)
    assert result.returncode != 0
    assert result.stdout == ''
    assert 'manifest' in result.stderr
    assert 'private-source-marker' not in result.stderr

def test_catalogue_rejects_duplicates_and_symlinked_manifests(tmp_path):
    tools = write(tmp_path, 'one.yml', MANIFEST)
    write(tmp_path, 'two.yml', MANIFEST)
    assert run(tmp_path).returncode != 0
    (tools / 'two.yml').unlink()
    (tools / 'two.yml').symlink_to(tools / 'one.yml')
    assert run(tmp_path).returncode != 0

def test_catalogue_explicit_directory_is_nonrecursive(tmp_path):
    tools = write(tmp_path, 'one.yml', MANIFEST)
    (tools / 'nested').mkdir()
    (tools / 'nested/invalid.yml').write_text('secret: private-source-marker')
    result = run(tmp_path, '--directory', str(tools))
    assert result.returncode == 0, result.stderr
    assert len(json.loads(result.stdout)['tools']) == 1

def test_catalogue_rejects_oversized_and_recursive_yaml(tmp_path):
    tools = write(tmp_path, 'one.yml', MANIFEST)
    (tools / 'one.yml').write_text('a' * 65537)
    assert run(tmp_path).returncode != 0
    (tools / 'one.yml').write_text('schema_version: 1\nparameters: &self {self: *self}\n')
    assert run(tmp_path).returncode != 0
