"""Read-only canonical diagnostics, independent of selected render targets."""
import json
from pathlib import Path
import subprocess
import sys

import pytest


def put(root, artifact_id, text):
    path = root / '.prosaic' / artifact_id
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def tree_bytes(root):
    return {str(p.relative_to(root)): p.read_bytes()
            for p in root.rglob('*') if p.is_file()}


def command(root, **extra):
    values = {'description': 'Check', **extra}
    import yaml
    return put(root, 'commands/check.md', '---\n' + yaml.safe_dump(values) + '---\nDo the check.\n')


def test_zero_targets_still_rejects_broken_bundle_reference_without_writes(tmp_path):
    from prosaic import validate_project
    put(tmp_path, 'skills/check/SKILL.md',
        '---\nname: Check\ndescription: Check\n---\n[missing](missing.md)\n')
    before = tree_bytes(tmp_path)
    report = validate_project(tmp_path, {'targets': []})
    assert report['valid'] is False and report['artifactCount'] == 1
    assert any(issue['code'] == 'unresolved-reference' for issue in report['issues'])
    assert tree_bytes(tmp_path) == before


def test_canonical_validation_collects_safe_parse_classification_and_schema_errors(tmp_path):
    from prosaic import validate_project
    put(tmp_path, 'commands/broken.md', '---\nsecret: [SECRET_PARSE_CANARY\n---\nBody')
    put(tmp_path, 'unknown.md', '---\ntype: SECRET_TYPE_CANARY\n---\nBody')
    put(tmp_path, 'commands/schema.md', '---\nexecution: SECRET_SCHEMA_CANARY\n---\nBody')
    command(tmp_path)
    report = validate_project(tmp_path, {'targets': []})
    assert report['schemaVersion'] == 1
    assert report['artifactCount'] == 1 and report['errorCount'] == 3
    assert {issue['code'] for issue in report['issues']} == {
        'malformed-frontmatter', 'classification', 'schema-invalid'}
    assert report['warningCount'] == 0 and not report['valid']
    text = json.dumps(report)
    assert 'CANARY' not in text and 'Body' not in text
    assert str(tmp_path) not in text
    assert all(len(issue['message']) <= 256 and len(issue['location']) <= 256
               for issue in report['issues'])


@pytest.mark.parametrize('targets', [[], ['codex-cli'], ['claude-code', 'codex-cli']])
def test_broken_references_do_not_depend_on_target_support(tmp_path, targets):
    from prosaic import validate_project
    put(tmp_path, 'skills/check/SKILL.md',
        '---\nname: Check\ndescription: Check\n---\n[missing](PRIVATE_MISSING.md)\n')
    report = validate_project(tmp_path, {'targets': targets})
    references = [i for i in report['issues'] if i['code'] == 'unresolved-reference']
    assert len(references) == 1 and references[0]['severity'] == 'error'
    assert 'targetId' not in references[0]
    assert 'PRIVATE_MISSING' not in json.dumps(report)


def test_resource_reference_is_validated_and_external_urls_remain_valid(tmp_path):
    from prosaic import validate_project
    put(tmp_path, 'skills/check/SKILL.md',
        '---\nname: Check\ndescription: Check\n---\n[guide](guide.md)\n[web](https://example.org)\n')
    put(tmp_path, 'skills/check/guide.md', '[missing](unknown.md)\n')
    report = validate_project(tmp_path, {'targets': []})
    assert [i['location'] for i in report['issues']] == ['$.resources[0].content']
    put(tmp_path, 'skills/check/guide.md', '[web](https://example.org)\n[anchor](#local)\n')
    assert validate_project(tmp_path, {'targets': []})['valid']


def test_nested_bundle_links_use_containing_resource_and_allow_primary_backlinks(tmp_path):
    from prosaic import validate_project
    put(tmp_path, 'skills/check/SKILL.md',
        '---\nname: Check\ndescription: Check\n---\n[guide](notes/../guide.md)\n')
    put(tmp_path, 'skills/check/guide.md', '[details](notes/details.md)\n')
    put(tmp_path, 'skills/check/notes/details.md', '[back](../SKILL.md)\n[guide](../guide.md)\n')
    assert validate_project(tmp_path, {'targets': []})['valid']


def test_render_failure_collects_other_diagnostics_without_private_exception(tmp_path, monkeypatch):
    from prosaic import validate_project, validation
    command(tmp_path, effort='deep')
    put(tmp_path, 'commands/other.md', '---\ncapability: strong\n---\nOther\n')
    pipeline = validation.run_pipeline
    def fail_one(artifact, descriptor, **kwargs):
        if artifact['id'] == 'commands/check.md':
            raise RuntimeError('PRIVATE_RENDER_CANARY')
        return pipeline(artifact, descriptor, **kwargs)
    monkeypatch.setattr(validation, 'run_pipeline', fail_one)
    report = validate_project(tmp_path, {'targets': ['codex-cli']})
    assert not report['valid']
    assert 'PRIVATE_RENDER_CANARY' not in json.dumps(report)
    assert sum(i['code'] == 'lossy-intent' for i in report['issues']) == 2
    assert sum(i['code'] == 'render-error' for i in report['issues']) == 1


@pytest.mark.parametrize('strict', [False, True])
def test_unsupported_pairs_warn_and_strict_changes_validity(tmp_path, strict):
    from prosaic import validate_project
    put(tmp_path, 'skills/check/SKILL.md', '---\nname: Check\ndescription: Check\n---\nCheck\n')
    report = validate_project(tmp_path, {'targets': ['codex-cli']}, strict=strict)
    assert report['valid'] is (not strict)
    assert report['errorCount'] == 0 and report['warningCount'] == 1
    assert report['issues'][0]['code'] == 'unsupported-pair'
    assert report['issues'][0]['targetId'] == 'codex-cli'


@pytest.mark.parametrize('lossy_policy,strict,valid,severity', [
    ('warn', False, True, 'warning'),
    ('warn', True, False, 'warning'),
    ('error', False, False, 'error'),
])
def test_multiple_losses_are_collected_with_declared_severity(tmp_path, lossy_policy, strict, valid, severity):
    from prosaic import validate_project
    command(tmp_path, effort='deep', capability='strong')
    report = validate_project(tmp_path, {'targets': ['codex-cli'], 'lossyPolicy': lossy_policy}, strict=strict)
    losses = [i for i in report['issues'] if i['code'] == 'lossy-intent']
    assert len(losses) == 2 and {i['severity'] for i in losses} == {severity}
    assert report['valid'] is valid
    assert {i['location'] for i in losses} == {'$.frontmatter.effort', '$.frontmatter.capability'}


def test_validation_never_reads_manifest_or_invokes_mutation_or_tool_discovery(tmp_path, monkeypatch):
    from prosaic import validate_project
    from prosaic import filesystem, lifecycle, locking, tools
    command(tmp_path)
    (tmp_path / '.prosaic-manifest.json').write_text('invalid but irrelevant')
    before = tree_bytes(tmp_path)
    def forbidden(*args, **kwargs):
        raise AssertionError('validation crossed its effect boundary')
    monkeypatch.setattr(filesystem.Manifest, 'load', forbidden)
    monkeypatch.setattr(filesystem.GuardedFs, 'write_file', forbidden)
    monkeypatch.setattr(filesystem.GuardedFs, 'write_file_atomic', forbidden)
    monkeypatch.setattr(lifecycle, 'apply', forbidden)
    monkeypatch.setattr(locking, 'project_mutation_lock', forbidden)
    monkeypatch.setattr(tools, 'discover_tools', forbidden)
    assert validate_project(tmp_path, {'targets': ['claude-code']})['valid']
    assert tree_bytes(tmp_path) == before


def test_report_order_and_ownership_are_deterministic(tmp_path):
    from prosaic import validate_project
    put(tmp_path, 'commands/z.md', '---\ntools: [read]\neffort: deep\n---\nZ\n')
    put(tmp_path, 'commands/a.md', '---\neffort: deep\n---\nA\n')
    options = {'targets': ['codex-cli', 'cursor']}
    first = validate_project(tmp_path, options)
    assert first == validate_project(tmp_path, options)
    keys = [(i.get('artifactId', ''), i.get('targetId', ''), i['code'], i['location'])
            for i in first['issues']]
    assert keys == sorted(keys)
    first['issues'].clear()
    assert validate_project(tmp_path, options)['issues']


@pytest.mark.parametrize('broken,strict,exit_code', [(False, False, 0), (True, False, 1), (False, True, 1)])
def test_cli_json_and_exit_status(tmp_path, broken, strict, exit_code):
    command(tmp_path, effort='deep')
    if broken:
        put(tmp_path, 'commands/broken.md', '---\n[SECRET_CLI_CANARY\n---\nDo\n')
    args = [sys.executable, '-m', 'prosaic', 'validate', '--json', '--targets', 'codex-cli']
    if strict:
        args.append('--strict')
    before = tree_bytes(tmp_path)
    result = subprocess.run(args, cwd=tmp_path, text=True, capture_output=True, timeout=10)
    assert result.returncode == exit_code, result.stderr
    assert result.stderr == ''
    report = json.loads(result.stdout)
    assert report['valid'] is (exit_code == 0)
    assert 'SECRET_CLI_CANARY' not in result.stdout
    assert tree_bytes(tmp_path) == before


def test_new_help_is_available_and_legacy_help_stays_frozen(tmp_path):
    from prosaic.cli import _help
    result = subprocess.run([sys.executable, '-m', 'prosaic', 'validate', '--help'],
                            cwd=tmp_path, text=True, capture_output=True, timeout=10)
    assert result.returncode == 0 and '--strict' in result.stdout
    original = json.loads(subprocess.check_output([
        'git', 'show', 'af7d90e178f61d53ba71bcc61c41c3ef7f941b4c:src/prosaic/data/help.json'],
        cwd=Path(__file__).resolve().parents[1]))
    for key, text in original.items():
        assert _help(key) == text


def test_cli_operational_error_preserves_error_channel(tmp_path):
    result = subprocess.run([sys.executable, '-m', 'prosaic', 'validate', '--json',
                             '--targets', 'missing-target'], cwd=tmp_path,
                            text=True, capture_output=True, timeout=10)
    assert result.returncode == 1 and result.stdout == ''
    assert 'Unknown target' in result.stderr


def test_cli_validation_flags_work_before_command(tmp_path):
    command(tmp_path, effort='deep')
    result = subprocess.run([sys.executable, '-m', 'prosaic', '--strict', '--json',
                             'validate', '--targets', 'codex-cli'], cwd=tmp_path,
                            text=True, capture_output=True, timeout=10)
    assert result.returncode == 1 and result.stderr == ''
    assert not json.loads(result.stdout)['valid']
