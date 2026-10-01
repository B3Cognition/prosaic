import pytest

from prosaic.pipeline import resolve_execution, resolve_execution_data
from prosaic.registry import builtin_registry, get_target, register_target
from test_pipeline import oracle


@pytest.mark.parametrize('fm', [
    {}, {'execution': 'command', 'tools': ['Read'], 'capability': 'strong', 'effort': 'high'},
    {'execution': 'invalid', 'tools': None, 'overrides': {'claude-code': {'tools': ['Bash']}}},
])
def test_resolved_fields_against_reference(fm):
    artifact = {'id': 'test', 'type': 'subagent', 'frontmatter': fm, 'body': '', 'sourcePath': 'subagents/test.md'}
    expected = oracle('console.log(JSON.stringify(require(root+"/registry/builtin.js").builtinRegistry().all().map(d=>require(root+"/resolve/resolve-execution.js").resolveExecution(input,d))))', artifact)
    assert [resolve_execution(artifact, d) for d in builtin_registry()] == expected


def test_dropped_neutral_is_unresolved_even_if_override_exists():
    desc = get_target('claude-code')
    desc['translations']['capability'] = {'toKey': 'model', 'drop': True}
    artifact = {'id': 'x', 'type': 'command', 'frontmatter': {'capability': 'strong', 'overrides': {'claude-code': {'model': 'best'}}}}
    assert resolve_execution(artifact, desc)['model'] == {'status': 'unresolved'}


def test_unregistered_target_never_discovers(tmp_path):
    assert resolve_execution_data(tmp_path, 'x', 'missing') == {
        'ok': False, 'errorKind': 'unregistered-target', 'targetId': 'missing',
        'message': 'Unknown target: "missing" is not in the target registry'}


def test_lookup_discovery_and_missing(tmp_path):
    source = tmp_path / '.prosaic' / 'commands'
    source.mkdir(parents=True)
    (source / 'test.md').write_text('---\nname: test\ntools: [Read]\n---\nBody\n')
    for artifact_id in ('commands/test.md', 'missing'):
        expected = oracle('console.log(JSON.stringify(require(root+"/resolve/lookup.js").resolveExecutionData(input)))',
                          {'projectRoot': str(tmp_path), 'artifactId': artifact_id, 'targetId': 'claude-code'})
        assert expected['ok'] == (artifact_id != 'missing')
        assert resolve_execution_data(tmp_path, artifact_id, 'claude-code') == expected


def test_config_override_lookup_and_internal_failure(tmp_path):
    source = tmp_path / 'custom' / 'skills'
    source.mkdir(parents=True)
    (source / 'test.md').write_text('---\nname: test\ndescription: test skill\nexecution: agent\ntools: [Read]\n---\nBody\n')
    options = {'projectRoot': str(tmp_path), 'artifactId': 'skills/test.md', 'targetId': 'claude-code', 'cli': {'source': 'custom'}}
    expected = oracle('console.log(JSON.stringify(require(root+"/resolve/lookup.js").resolveExecutionData(input)))', options)
    assert expected['ok']
    assert resolve_execution_data(tmp_path, 'skills/test.md', 'claude-code', {'source': 'custom'}) == expected
    descriptor = get_target('claude-code')
    descriptor.update(id='custom', translations={'capability': {'toKey': 'model', 'valueMap': {'strong': 'best'}}})
    registry = register_target([], descriptor)
    custom = resolve_execution_data(tmp_path, 'skills/test.md', 'custom', {'source': 'custom'}, registry)
    assert custom['ok'] and custom['data']['targetId'] == 'custom'
    (tmp_path / 'prosaic.config.yaml').write_text('unknownKey: true\n')
    expected = oracle('console.log(JSON.stringify(require(root+"/resolve/lookup.js").resolveExecutionData(input)))', options)
    assert expected['errorKind'] == 'internal'
    assert resolve_execution_data(tmp_path, 'skills/test.md', 'claude-code', {'source': 'custom'}) == expected
