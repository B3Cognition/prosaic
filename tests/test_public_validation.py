"""Pure canonical validation for artifacts that have no filesystem location."""
import json

import pytest


@pytest.mark.parametrize('kind,frontmatter', [
    ('rule', {}),
    ('skill', {'name': 'reader', 'description': 'Read supplied prose'}),
    ('subagent', {'name': 'reader', 'description': 'Read supplied prose'}),
    ('command', {}),
])
def test_public_definition_validation_accepts_supported_explicit_kinds(kind, frontmatter):
    from prosaic import validate_artifact_definition

    assert validate_artifact_definition(kind, frontmatter) == {
        'ok': True, 'frontmatter': frontmatter,
    }


@pytest.mark.parametrize('kind', ['rule', 'skill', 'subagent', 'command'])
def test_matching_declared_type_is_retained(kind):
    from prosaic import validate_artifact_definition

    frontmatter = {'type': kind, 'name': 'reader', 'description': 'Read supplied prose'}
    assert validate_artifact_definition(kind, frontmatter) == {
        'ok': True, 'frontmatter': frontmatter,
    }


@pytest.mark.parametrize('kind', ['', 'agent', 'SUBAGENT', None, 1, [], {}])
def test_unknown_explicit_kind_is_rejected(kind):
    from prosaic import validate_artifact_definition

    result = validate_artifact_definition(kind, {'name': 'reader', 'description': 'Read prose'})
    assert result['ok'] is False
    assert result['field'] == 'type'
    assert isinstance(result['reason'], str) and result['reason']


@pytest.mark.parametrize('declared_type', ['rule', 'unknown', '', None, 1, [], {}])
def test_declared_type_must_agree_with_explicit_kind(declared_type):
    from prosaic import validate_artifact_definition

    result = validate_artifact_definition('subagent', {
        'type': declared_type, 'name': 'reader', 'description': 'Read prose',
    })
    assert result['ok'] is False
    assert result['field'] == 'type'
    assert isinstance(result['reason'], str) and result['reason']


@pytest.mark.parametrize('kind,frontmatter,field,reason', [
    ('skill', {}, 'name', 'skill requires a name'),
    ('subagent', {}, 'name', 'subagent requires a name'),
    ('subagent', {'name': 'reader'}, 'description', 'subagent requires a description'),
    ('subagent', {'name': '', 'description': 'Read prose'}, 'name', 'String must contain at least 1 character(s)'),
    ('command', {'tools': ['read_file', 1]}, 'tools', 'Invalid input'),
    ('rule', {'effort': 1}, 'effort', 'Expected string, received number'),
])
def test_definition_validation_preserves_canonical_field_contract(kind, frontmatter, field, reason):
    from prosaic import validate_artifact_definition

    assert validate_artifact_definition(kind, frontmatter) == {
        'ok': False, 'field': field, 'reason': reason,
    }


@pytest.mark.parametrize('frontmatter', [None, [], 'name: reader', 1])
def test_definition_validation_requires_a_frontmatter_mapping(frontmatter):
    from prosaic import validate_artifact_definition

    result = validate_artifact_definition('rule', frontmatter)
    assert result['ok'] is False
    assert result['field'] == 'frontmatter'
    assert isinstance(result['reason'], str) and result['reason']


def test_absent_type_and_execution_extensions_keep_original_content():
    from prosaic import validate_artifact_definition

    frontmatter = {
        'name': 'reader', 'description': 'Read supplied prose',
        'effort': 'vendor-specific', 'tools': 'vendor-capability',
        'vendor': {'mode': 'custom', 'levels': [1, 2]},
    }
    serialized = json.dumps(frontmatter, sort_keys=True)
    result = validate_artifact_definition('subagent', frontmatter)

    assert result['ok'] is True
    assert json.dumps(frontmatter, sort_keys=True) == serialized
    assert json.dumps(result['frontmatter'], sort_keys=True) == serialized
    assert result['frontmatter'] is not frontmatter
    assert 'type' not in frontmatter and 'type' not in result['frontmatter']


def test_existing_frontmatter_validator_still_leaves_classification_to_discovery():
    from prosaic.core import validate_frontmatter

    frontmatter = {
        'type': 'rule', 'name': 'reader', 'description': 'Read prose',
        'effort': 'vendor-specific',
    }
    assert validate_frontmatter('subagent', frontmatter) == {
        'ok': True, 'frontmatter': frontmatter,
    }
