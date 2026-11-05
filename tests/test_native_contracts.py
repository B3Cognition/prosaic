"""Opt-in layouts must fix discovery without sacrificing ownership or local edits."""
import json
from pathlib import Path

import pytest

from prosaic import apply, revert
from prosaic.config import ConfigError, resolve_config
from prosaic.registry import get_target, parse_descriptor
from prosaic.pipeline import run_pipeline


def put(root, path, content):
    dest = root / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content.encode() if isinstance(content, str) else content)
    return dest


def native(root, targets=('claude-code', 'agents-md')):
    put(root, 'prosaic.config.yaml', 'outputContracts: native-v1\ntargets: ' + json.dumps(targets) + '\n')


def rule(root, name='infra', body='Use approved modules.\n'):
    return put(root, f'.prosaic/rules/{name}.md', '---\ndescription: Infrastructure rules\n---\n' + body)


def skill(root, name):
    put(root, f'.prosaic/skills/{name}/SKILL.md',
        f'---\nname: {name}\ndescription: Follow the {name} workflow\n---\n[modules](references/modules.md)\n')
    put(root, f'.prosaic/skills/{name}/references/modules.md', f'{name} resources\n')


def snapshot(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}


def test_new_project_defaults_native_and_existing_config_keeps_legacy(tmp_path):
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    assert get_target('claude-code')['slots']['skill'] == {'dir': '.claude/skills', 'extension': '.md'}
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code]\n')
    assert 'outputContracts' not in resolve_config(tmp_path)
    native(tmp_path)
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    put(tmp_path, 'prosaic.config.yaml', 'outputContracts: unknown\n')
    with pytest.raises(ConfigError):
        resolve_config(tmp_path)


def test_bundle_descriptor_survives_parsing_and_preserves_resources():
    desc = get_target('claude-code')
    desc['slots']['skill'].update(layout='bundle', primaryName='SKILL.md')
    parsed = parse_descriptor(desc)
    assert parsed['slots']['skill']['layout'] == 'bundle'
    artifact = {'id': 'skills/check/SKILL.md', 'sourcePath': 'skills/check/SKILL.md',
                'bundleRoot': 'skills/check', 'type': 'skill',
                'frontmatter': {'name': 'check', 'description': 'Check'},
                'body': '[guide](references/guide.md)\n',
                'resources': [{'relPath': 'references/guide.md', 'content': 'Guide\n'}]}
    rendered = run_pipeline(artifact, parsed)
    assert rendered['path'] == '.claude/skills/check/SKILL.md'
    assert rendered['resources'] == [{'path': '.claude/skills/check/references/guide.md', 'content': 'Guide\n'}]
    assert '[guide](references/guide.md)' in rendered['content']


@pytest.mark.parametrize('slot', [
    {'layout': 'other'}, {'layout': 'bundle'},
    {'layout': 'bundle', 'primaryName': '../SKILL.md'},
    {'layout': 'bundle', 'primaryName': '/SKILL.md'},
])
def test_invalid_bundle_descriptor_is_rejected(slot):
    from prosaic.registry import validate_descriptor
    desc = get_target('claude-code')
    desc['slots']['skill'].update(slot)
    assert not validate_descriptor(desc)['ok']


def test_native_layouts_isolate_resources_and_emit_one_agents_file(tmp_path):
    native(tmp_path)
    rule(tmp_path, 'z', 'Last rule.\n')
    rule(tmp_path, 'a', 'First rule.\n')
    skill(tmp_path, 'first')
    skill(tmp_path, 'second')
    apply(tmp_path)
    for name in ('first', 'second'):
        primary = tmp_path / f'.claude/skills/{name}/SKILL.md'
        assert primary.is_file() and '[modules](references/modules.md)' in primary.read_text()
        assert (primary.parent / 'references/modules.md').read_text() == f'{name} resources\n'
    assert (tmp_path / '.claude/rules/a.md').is_file()
    assert not (tmp_path / '.claude/a.md').exists()
    agents = (tmp_path / 'AGENTS.md').read_text()
    assert agents.count('<!-- prosaic:begin -->') == 1
    assert agents.index('First rule.') < agents.index('Last rule.')
    assert 'description:' not in agents
    manifest = json.loads((tmp_path / '.prosaic-manifest.json').read_text())
    assert all(e['path'] not in ('AGENTS.md', './AGENTS.md') for e in manifest['entries'])


def test_apply_and_revert_preserve_local_bytes_and_noop_writes(tmp_path, monkeypatch):
    from prosaic.filesystem import GuardedFs
    native(tmp_path, ['agents-md'])
    rule(tmp_path)
    local = b'# Local instructions\r\n\r\nKeep these bytes without a final newline.'
    put(tmp_path, 'AGENTS.md', local)
    apply(tmp_path)
    before = snapshot(tmp_path)
    def no_write(*args, **kwargs):
        raise AssertionError('idempotent apply wrote a file')
    with monkeypatch.context() as patch:
        patch.setattr(GuardedFs, 'write_file_atomic', no_write)
        assert apply(tmp_path)['changedFiles'] == 0
    assert snapshot(tmp_path) == before
    rule(tmp_path, body='Updated central rule.\n')
    apply(tmp_path)
    assert (tmp_path / 'AGENTS.md').read_bytes().startswith(local)
    # Revert must find block ownership even after the opt-in is removed.
    put(tmp_path, 'prosaic.config.yaml', 'targets: [agents-md]\n')
    revert(tmp_path)
    assert (tmp_path / 'AGENTS.md').read_bytes() == local


@pytest.mark.parametrize('bad', [
    '<!-- prosaic:begin -->\nmissing end\n',
    '<!-- prosaic:end -->\n<!-- prosaic:begin -->\n',
    '<!-- prosaic:begin -->\na\n<!-- prosaic:end -->\n<!-- prosaic:begin -->\nb\n<!-- prosaic:end -->\n',
])
def test_malformed_or_unowned_markers_abort_before_outputs(tmp_path, bad):
    native(tmp_path)
    rule(tmp_path)
    put(tmp_path, 'AGENTS.md', bad)
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        apply(tmp_path)
    assert {k: v for k, v in snapshot(tmp_path).items() if k != '.prosaic-operation.lock'} == before


def test_modified_managed_block_survives_apply_and_revert(tmp_path):
    native(tmp_path, ['agents-md'])
    rule(tmp_path)
    apply(tmp_path)
    path = tmp_path / 'AGENTS.md'
    path.write_text(path.read_text().replace('approved', 'locally edited'))
    before = snapshot(tmp_path)
    for operation in (apply, revert):
        with pytest.raises(ValueError):
            operation(tmp_path)
        assert snapshot(tmp_path) == before


@pytest.mark.parametrize('edited,blocked', [(True, False), (False, True)])
def test_migration_conflicts_keep_old_outputs_and_manifest(tmp_path, edited, blocked):
    rule(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code]\n')
    apply(tmp_path, {'targets': ['claude-code']})
    old = tmp_path / '.claude/infra.md'
    if edited:
        old.write_text('Local changes.\n')
    if blocked:
        put(tmp_path, '.claude/rules/infra.md', 'Handwritten destination.\n')
    native(tmp_path, ['claude-code'])
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        apply(tmp_path)
    assert snapshot(tmp_path) == before


def test_successful_migration_cleans_only_recorded_old_files(tmp_path):
    rule(tmp_path)
    skill(tmp_path, 'first')
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code, agents-md]\n')
    apply(tmp_path, {'targets': ['claude-code', 'agents-md']})
    put(tmp_path, '.claude/local.md', 'Local\n')
    native(tmp_path)
    apply(tmp_path)
    assert not (tmp_path / '.claude/infra.md').exists()
    assert not (tmp_path / '.claude/skills/first.md').exists()
    assert not (tmp_path / 'infra.md').exists()
    assert (tmp_path / '.claude/local.md').read_text() == 'Local\n'
    assert (tmp_path / '.claude/skills/first/SKILL.md').is_file()


def test_failed_replacement_write_never_cleans_old_output(tmp_path, monkeypatch):
    from prosaic.filesystem import GuardedFs
    rule(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code]\n')
    apply(tmp_path, {'targets': ['claude-code']})
    native(tmp_path, ['claude-code'])
    original = GuardedFs.write_file_atomic
    def fail(self, path, content):
        if str(path) == '.claude/rules/infra.md':
            raise OSError('simulated replacement failure')
        return original(self, path, content)
    monkeypatch.setattr(GuardedFs, 'write_file_atomic', fail)
    with pytest.raises(OSError):
        apply(tmp_path)
    assert (tmp_path / '.claude/infra.md').is_file()


def test_native_duplicate_output_aborts_without_writes(tmp_path):
    native(tmp_path, ['claude-code'])
    rule(tmp_path)
    put(tmp_path, '.prosaic/rules/nested/infra.md', 'Different rule.\n')
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        apply(tmp_path)
    assert {k: v for k, v in snapshot(tmp_path).items() if k != '.prosaic-operation.lock'} == before


def test_check_is_read_only_and_detects_missing_and_edited_outputs(tmp_path):
    from prosaic import check_project
    native(tmp_path)
    rule(tmp_path)
    before = snapshot(tmp_path)
    report = check_project(tmp_path)
    assert report['schemaVersion'] == 1 and not report['clean']
    assert report['changedFiles'] == 2
    assert snapshot(tmp_path) == before
    apply(tmp_path)
    assert check_project(tmp_path)['clean']
    (tmp_path / '.claude/rules/infra.md').write_text('Edited\n')
    before = snapshot(tmp_path)
    assert not check_project(tmp_path)['clean']
    assert snapshot(tmp_path) == before


def test_check_works_on_committed_outputs_without_local_provenance(tmp_path):
    from prosaic import check_project
    native(tmp_path)
    rule(tmp_path)
    apply(tmp_path)
    (tmp_path / '.prosaic-manifest.json').unlink()
    (tmp_path / '.prosaic-blocks.json').unlink()
    before = snapshot(tmp_path)
    assert check_project(tmp_path)['clean']
    assert snapshot(tmp_path) == before


def test_cli_check_exit_codes_and_legacy_drift(tmp_path, monkeypatch, capsys):
    from prosaic.cli import main
    rule(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code]\n')
    monkeypatch.chdir(tmp_path)
    assert main(['check', '--json']) == 1
    assert not json.loads(capsys.readouterr().out)['clean']
    assert not (tmp_path / '.prosaic-operation.lock').exists()
    apply(tmp_path)
    assert main(['check', '--json']) == 0
    assert json.loads(capsys.readouterr().out)['clean']
    (tmp_path / '.claude/infra.md').unlink()
    assert main(['check']) == 1


def test_check_rejects_invalid_source_and_corrupt_ownership(tmp_path):
    from prosaic import check_project
    native(tmp_path)
    assert not check_project(tmp_path)['clean']
    rule(tmp_path)
    apply(tmp_path)
    put(tmp_path, '.prosaic-blocks.json', '{}')
    assert not check_project(tmp_path)['clean']


def test_partial_selection_preserves_other_types_and_managed_block(tmp_path):
    native(tmp_path)
    rule(tmp_path)
    skill(tmp_path, 'first')
    apply(tmp_path)
    (tmp_path / '.prosaic/rules/infra.md').unlink()
    apply(tmp_path, {'artifactTypes': ['skill']})
    assert (tmp_path / '.claude/rules/infra.md').is_file()
    assert (tmp_path / 'AGENTS.md').is_file()
    apply(tmp_path)
    assert not (tmp_path / '.claude/rules/infra.md').exists()
    assert not (tmp_path / 'AGENTS.md').exists()


def test_cannot_silently_switch_managed_native_output_to_legacy(tmp_path):
    native(tmp_path)
    rule(tmp_path)
    apply(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'outputContracts: legacy\ntargets: [claude-code, agents-md]\n')
    before = snapshot(tmp_path)
    with pytest.raises(ValueError, match='native'):
        apply(tmp_path)
    assert snapshot(tmp_path) == before


def test_native_output_alias_collision_aborts(tmp_path):
    from prosaic.registry import Registry, StaticRegistrySource
    rule(tmp_path)
    native(tmp_path, ['first', 'second'])
    desc = get_target('claude-code')
    first = {**desc, 'id': 'first', 'destinationDir': 'real'}
    second = {**desc, 'id': 'second', 'destinationDir': 'alias'}
    (tmp_path / 'real').mkdir()
    (tmp_path / 'alias').symlink_to(tmp_path / 'real', target_is_directory=True)
    with pytest.raises(ValueError, match='Duplicate'):
        apply(tmp_path, registry=Registry(StaticRegistrySource([first, second])))
    assert not (tmp_path / 'real/infra.md').exists()


def test_native_revert_preserves_edited_whole_file(tmp_path):
    native(tmp_path, ['claude-code'])
    rule(tmp_path)
    apply(tmp_path)
    put(tmp_path, '.claude/rules/infra.md', 'Local edit\n')
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        revert(tmp_path)
    assert snapshot(tmp_path) == before


def test_native_file_revert_stays_safe_after_opt_out(tmp_path):
    native(tmp_path, ['claude-code'])
    rule(tmp_path)
    apply(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code]\n')
    put(tmp_path, '.claude/rules/infra.md', 'Local edit\n')
    with pytest.raises(ValueError):
        revert(tmp_path)
    assert (tmp_path / '.claude/rules/infra.md').read_text() == 'Local edit\n'


def test_can_return_to_legacy_after_reverting_native(tmp_path):
    native(tmp_path)
    rule(tmp_path)
    apply(tmp_path)
    revert(tmp_path)
    put(tmp_path, 'prosaic.config.yaml', 'outputContracts: legacy\ntargets: [claude-code, agents-md]\n')
    apply(tmp_path)
    assert (tmp_path / '.claude/infra.md').is_file()


def test_package_deploy_cannot_erase_native_ownership_safety(tmp_path):
    from prosaic.packages import deploy_package
    native(tmp_path, ['claude-code'])
    rule(tmp_path)
    apply(tmp_path)
    put(tmp_path, 'package-source/message.txt', 'Package\n')
    put(tmp_path, 'prosaic.config.yaml',
        'targets: [claude-code]\npackages:\n  - id: extras\n    sourceRoot: package-source\n    destinationRoot: installed\n')
    deploy_package(tmp_path, 'extras')
    put(tmp_path, '.claude/rules/infra.md', 'Local edit after package deploy\n')
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        revert(tmp_path)
    assert snapshot(tmp_path) == before


def test_failure_in_later_replacement_can_be_retried(tmp_path, monkeypatch):
    from prosaic.filesystem import GuardedFs
    native(tmp_path)
    rule(tmp_path, 'a')
    rule(tmp_path, 'z')
    before = snapshot(tmp_path)
    original = GuardedFs.write_file_atomic
    def fail(self, path, content):
        if str(path) == '.claude/rules/z.md':
            raise OSError('simulated second replacement failure')
        return original(self, path, content)
    with monkeypatch.context() as patch:
        patch.setattr(GuardedFs, 'write_file_atomic', fail)
        with pytest.raises(OSError):
            apply(tmp_path)
    assert {k: v for k, v in snapshot(tmp_path).items() if k != '.prosaic-operation.lock'} == before
    apply(tmp_path)
    assert (tmp_path / '.claude/rules/z.md').is_file()


def test_output_changed_mid_execution_is_preserved(tmp_path, monkeypatch):
    from prosaic.filesystem import GuardedFs
    native(tmp_path, ['claude-code'])
    rule(tmp_path, 'a')
    z = rule(tmp_path, 'z')
    apply(tmp_path)
    rule(tmp_path, 'a', 'New a\n')
    z.write_text('New z\n')
    original = GuardedFs.write_file_atomic
    def edit_next(self, path, content):
        original(self, path, content)
        if str(path) == '.claude/rules/a.md':
            (tmp_path / '.claude/rules/z.md').write_text('Concurrent local change\n')
    monkeypatch.setattr(GuardedFs, 'write_file_atomic', edit_next)
    with pytest.raises(ValueError):
        apply(tmp_path)
    assert (tmp_path / '.claude/rules/z.md').read_text() == 'Concurrent local change\n'


def test_native_conformance_outputs_match_committed_generated_fixtures(tmp_path):
    import shutil
    fixture = Path(__file__).resolve().parents[1] / 'conformance-fixtures/native-v1'
    shutil.copytree(fixture / 'source', tmp_path / '.prosaic')
    native(tmp_path)
    report = apply(tmp_path)
    actual = {w['path']: (tmp_path / w['path']).read_bytes() for w in report['plan']['writes']}
    assert actual == snapshot(fixture / 'expected')


def test_contract_matrix_matches_generator():
    import importlib.util
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location('generate_contracts', root / 'scripts/generate_contracts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (root / 'docs/contract-matrix.md').read_text() == module.contract_matrix()


def test_failed_block_file_deletion_restores_content_and_allows_retry(tmp_path, monkeypatch):
    from prosaic.filesystem import GuardedFs
    native(tmp_path, ['agents-md'])
    rule(tmp_path)
    apply(tmp_path)
    before = snapshot(tmp_path)
    original = GuardedFs.delete_file
    def fail(self, path):
        if str(path) == 'AGENTS.md':
            raise OSError('simulated unlink failure')
        return original(self, path)
    with monkeypatch.context() as patch:
        patch.setattr(GuardedFs, 'delete_file', fail)
        with pytest.raises(OSError):
            revert(tmp_path)
    # Prior-content backups can remain as evidence after a failed operation.
    assert {k: v for k, v in snapshot(tmp_path).items() if not k.startswith('.prosaic-backups/')} == before
    revert(tmp_path)
    assert not (tmp_path / 'AGENTS.md').exists()


def test_whole_file_ownership_cannot_become_block_ownership_silently(tmp_path):
    from prosaic.registry import Registry, StaticRegistrySource
    native(tmp_path, ['agents-md'])
    rule(tmp_path, 'AGENTS')
    descriptor = get_target('agents-md')
    apply(tmp_path, registry=Registry(StaticRegistrySource([descriptor])))
    put(tmp_path, 'AGENTS.md', 'Local instructions appended to an owned file\n')
    before = snapshot(tmp_path)
    with pytest.raises(ValueError):
        apply(tmp_path)
    assert snapshot(tmp_path) == before


def test_native_zero_target_revert_is_a_read_only_noop(tmp_path):
    native(tmp_path, [])
    before = snapshot(tmp_path)
    assert revert(tmp_path)['removed'] == 0
    assert snapshot(tmp_path) == before


def test_first_apply_without_config_uses_native_and_records_the_choice(tmp_path):
    rule(tmp_path)
    skill(tmp_path, 'first')
    apply(tmp_path, {'targets': ['claude-code', 'agents-md']})
    assert (tmp_path / '.claude/rules/infra.md').is_file()
    assert (tmp_path / '.claude/skills/first/SKILL.md').is_file()
    assert (tmp_path / 'AGENTS.md').is_file()
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    put(tmp_path, 'prosaic.config.yaml', 'targets: [claude-code, agents-md]\n')
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    assert apply(tmp_path)['changedFiles'] == 0


def test_existing_manifest_without_config_keeps_legacy_default(tmp_path):
    from prosaic.filesystem import GuardedFs, Manifest
    Manifest(GuardedFs(tmp_path)).save()
    rule(tmp_path)
    assert 'outputContracts' not in resolve_config(tmp_path)
    apply(tmp_path, {'targets': ['claude-code']})
    assert (tmp_path / '.claude/infra.md').is_file()
    assert not (tmp_path / '.claude/rules/infra.md').exists()


def test_layout_default_does_not_change_canonical_inspection(tmp_path):
    from prosaic import inspect_artifact
    rule(tmp_path)
    before = inspect_artifact(tmp_path, 'rules/infra.md')
    native(tmp_path)
    assert inspect_artifact(tmp_path, 'rules/infra.md') == before


def test_native_default_survives_successful_apply_with_no_selected_output(tmp_path):
    rule(tmp_path)
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    # A legitimate filtered run can produce no output before the first full run.
    assert apply(tmp_path, {'targets': ['claude-code'], 'artifactTypes': ['command']})['changedFiles'] == 0
    assert resolve_config(tmp_path)['outputContracts'] == 'native-v1'
    apply(tmp_path, {'targets': ['claude-code']})
    assert (tmp_path / '.claude/rules/infra.md').is_file()
    assert not (tmp_path / '.claude/infra.md').exists()
