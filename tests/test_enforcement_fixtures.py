"""Committed enforcement-tag fixtures: inspection, validation and distribution goldens."""

import json
from pathlib import Path
import re
import shutil

import pytest

from prosaic import apply, inspect_artifact, resolve_execution_data, validate_project
from prosaic.core import discover
from prosaic.pipeline import run_pipeline
from prosaic.registry import builtin_registry

FIXTURES = Path(__file__).resolve().parents[1] / 'conformance-fixtures' / 'enforcement-tags'
ERROR_CASES = ['malformed', 'unknown-stage', 'unknown-action', 'duplicate-guard', 'no-rule']
LEGACY_KEYS = {'id', 'type', 'frontmatter', 'body', 'bundleRoot', 'resources'}


def project(tmp_path, name):
    root = tmp_path / name.replace('/', '-')
    shutil.copytree(FIXTURES / name, root)
    return root


def artifacts(root):
    return discover(root / '.prosaic', root)['artifacts']


def test_tagged_fixture_inspects_to_committed_rules(tmp_path):
    root = project(tmp_path, 'tagged')
    expected = json.loads((FIXTURES / 'tagged/expected-rules.json').read_text())
    assert sorted(a['id'] for a in artifacts(root)) == sorted(expected)
    for artifact_id, rules in expected.items():
        result = inspect_artifact(root, artifact_id)
        assert result['ok'], result
        assert result['data']['rules'] == rules
        assert result['data']['ruleIssues'] == []


def test_untagged_fixture_keeps_the_legacy_inspection_shape(tmp_path):
    root = project(tmp_path, 'untagged')
    for artifact in artifacts(root):
        data = inspect_artifact(root, artifact['id'])['data']
        assert set(data) == LEGACY_KEYS


def test_inspection_is_deterministic_and_reports_unchanged_body(tmp_path):
    root = project(tmp_path, 'tagged')
    first = inspect_artifact(root, 'subagents/shelf-keeper.md')
    second = inspect_artifact(root, 'subagents/shelf-keeper.md')
    assert json.dumps(first) == json.dumps(second)
    raw = (root / '.prosaic/subagents/shelf-keeper.md').read_text()
    assert raw.endswith(first['data']['body'])
    assert '<!-- enforce: max_lines' in first['data']['body']


@pytest.mark.parametrize('case', ERROR_CASES)
def test_error_fixture_inspection(tmp_path, case):
    root = project(tmp_path, 'errors/' + case)
    expected = json.loads((FIXTURES / 'errors' / case / 'expected-inspect.json').read_text())
    result = inspect_artifact(root, expected['artifactId'])
    assert result['ok'], result
    assert result['data']['rules'] == expected['rules']
    assert result['data']['ruleIssues'] == expected['ruleIssues']


@pytest.mark.parametrize('case', ERROR_CASES)
def test_error_fixture_validation_report(tmp_path, case):
    root = project(tmp_path, 'errors/' + case)
    expected = json.loads((FIXTURES / 'errors' / case / 'expected-inspect.json').read_text())
    issues = sorted(
        ({**issue, 'artifactId': expected['artifactId']} for issue in expected['ruleIssues']),
        key=lambda issue: issue['code'],
    )
    report = validate_project(root, {'targets': []})
    assert report['issues'] == issues
    assert report['valid'] is False and report['errorCount'] == len(issues)
    assert report['artifactCount'] == 1


@pytest.mark.parametrize('case', ERROR_CASES)
def test_error_fixture_definition_validation_names_the_first_problem(case):
    from prosaic import parse_artifact, validate_artifact_definition

    expected = json.loads((FIXTURES / 'errors' / case / 'expected-inspect.json').read_text())
    path = FIXTURES / 'errors' / case / '.prosaic' / expected['artifactId']
    parsed = parse_artifact(path.read_text())
    result = validate_artifact_definition(
        'subagent', parsed['frontmatter'], body=parsed['body'], source_path=expected['artifactId']
    )
    # Definitions have no file context, so lines count from the supplied body,
    # after the four fixture frontmatter lines.
    first = re.sub(
        r'(:|line )(\d+)', lambda m: m[1] + str(int(m[2]) - 4), expected['ruleIssues'][0]['message'], count=2
    )
    assert result == {'ok': False, 'field': 'body', 'reason': first}


@pytest.mark.parametrize('name', ['tagged', 'untagged'])
def test_valid_fixtures_have_no_canonical_issues(tmp_path, name):
    report = validate_project(project(tmp_path, name), {'targets': []})
    assert report['valid'] and report['issues'] == []


def test_tagged_and_untagged_validate_identically_for_every_target(tmp_path):
    tagged = validate_project(project(tmp_path, 'tagged'), {'targets': ['all']})
    untagged = validate_project(project(tmp_path, 'untagged'), {'targets': ['all']})
    assert tagged == untagged


def rendered(root):
    outputs = {}
    for descriptor in builtin_registry():
        for artifact in artifacts(root):
            if descriptor['capabilities'].get(artifact['type'], False):
                outputs[(descriptor['id'], artifact['id'])] = run_pipeline(artifact, descriptor)
    return outputs


def test_every_target_renders_tagged_source_byte_identical_to_untagged(tmp_path):
    tagged = rendered(project(tmp_path, 'tagged'))
    untagged = rendered(project(tmp_path, 'untagged'))
    assert len(tagged) > 40 and tagged.keys() == untagged.keys()
    for key, result in tagged.items():
        assert result == untagged[key], key


def plan(root):
    report = apply(root, {'targets': ['all']}, dry_run=True)
    return ([(w['targetId'], w['path'], w['content'].encode()) for w in report['plan']['writes']], report['warnings'])


def test_apply_distributes_byte_identical_output_for_every_target(tmp_path):
    tagged_writes, tagged_warnings = plan(project(tmp_path, 'tagged'))
    untagged_writes, untagged_warnings = plan(project(tmp_path, 'untagged'))
    assert tagged_writes and tagged_writes == untagged_writes
    assert tagged_warnings == untagged_warnings
    contents = b''.join(content for _, _, content in tagged_writes)
    # Tags inside code blocks and code spans are examples, distributed verbatim.
    examples = contents.count(b'<!-- enforce: example_only(stage=final) -->')
    assert examples and contents.count(b'`<!-- enforce: name() -->`') == examples
    assert contents.count(b'<!-- enforce:') == 2 * examples
    assert b'<!-- prose-only' not in contents


def test_apply_writes_identical_files(tmp_path):
    roots = [project(tmp_path, 'tagged'), project(tmp_path, 'untagged')]
    files = []
    for root in roots:
        report = apply(root, {'targets': ['claude-code', 'codex-cli', 'goose', 'github-copilot']})
        files.append({w['path']: (root / w['path']).read_bytes() for w in report['plan']['writes']})
    assert files[0] and files[0] == files[1]


def test_resolve_is_identical_for_tagged_and_untagged_sources(tmp_path):
    roots = [project(tmp_path, 'tagged'), project(tmp_path, 'untagged')]
    for artifact in artifacts(roots[0]):
        for descriptor in builtin_registry():
            results = [resolve_execution_data(root, artifact['id'], descriptor['id']) for root in roots]
            assert results[0]['ok'] and results[0] == results[1]


def test_package_deploy_copies_canonical_source_with_its_tags(tmp_path):
    from prosaic import deploy_package

    shutil.copytree(FIXTURES / 'tagged/.prosaic', tmp_path / 'source')
    (tmp_path / 'prosaic.config.yaml').write_text(
        'packages:\n  - id: pkg\n    sourceRoot: source\n    destinationRoot: deployed\n'
    )
    deploy_package(tmp_path, 'pkg')
    for path in (tmp_path / 'source').rglob('*.md'):
        relative = path.relative_to(tmp_path / 'source')
        assert (tmp_path / 'deployed' / relative).read_bytes() == path.read_bytes()


@pytest.mark.parametrize('case', ERROR_CASES)
def test_apply_strips_even_invalid_tags(tmp_path, case):
    writes, _ = plan(project(tmp_path, 'errors/' + case))
    assert writes
    for _, _, content in writes:
        assert b'<!-- enforce' not in content and b'<!-- prose-only' not in content
