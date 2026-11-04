"""Inert enforcement tags: grammar, binding, stripping and core isolation."""

import ast
import builtins
import json
from pathlib import Path
import tomllib

import pytest

from prosaic.enforcement import has_tags, parse_rules, strip_tags

ROOT = Path(__file__).resolve().parents[1]
MALFORMED = 'malformed tag; expected <!-- enforce: NAME(key=value, ...) --> or <!-- prose-only: REASON -->, NAME matching [a-z][a-z0-9_]*'


def only_rule(tag):
    parsed = parse_rules('- Keep it short. ' + tag + '\n', 'agents/x.md')
    assert parsed['issues'] == []
    assert len(parsed['rules']) == 1
    return parsed['rules'][0]


@pytest.mark.parametrize(
    'tag,guard,stage,action,settings',
    [
        ('<!-- enforce: brevity() -->', 'brevity', 'final', 'retry', {}),
        ('<!--enforce:brevity()-->', 'brevity', 'final', 'retry', {}),
        (
            '<!-- enforce : brevity ( limit = 3 , tags = [ ] ) -->',
            'brevity',
            'final',
            'retry',
            {'limit': 3, 'tags': []},
        ),
        ('<!-- enforce: brevity(offset=-2) -->', 'brevity', 'final', 'retry', {'offset': -2}),
        ('<!-- enforce: brevity(flag=true) -->', 'brevity', 'final', 'retry', {'flag': 'true'}),
        ('<!-- enforce: brevity(items=[a, 2, "c d"]) -->', 'brevity', 'final', 'retry', {'items': ['a', 2, 'c d']}),
        (
            '<!-- enforce: brevity(note="say \\"hi\\" \\\\ (now), ok=no") -->',
            'brevity',
            'final',
            'retry',
            {'note': 'say "hi" \\ (now), ok=no'},
        ),
        ('<!-- enforce: brevity(stage=before_tool, on_violation=fix) -->', 'brevity', 'before_tool', 'fix', {}),
        ('<!-- enforce: brevity(stage=after_tool) -->', 'brevity', 'after_tool', 'retry', {}),
        (
            '<!-- enforce: brevity(on_violation=fail, stage=before_answer, z=1, a=2) -->',
            'brevity',
            'before_answer',
            'fail',
            {'z': 1, 'a': 2},
        ),
        ('<!-- enforce: v2_check_9() -->', 'v2_check_9', 'final', 'retry', {}),
    ],
)
def test_enforce_grammar(tag, guard, stage, action, settings):
    rule = only_rule(tag)
    assert (rule['guard'], rule['stage'], rule['action'], rule['settings']) == (guard, stage, action, settings)
    assert list(rule['settings']) == list(settings)
    assert rule['kind'] == 'enforce' and rule['reason'] is None
    assert rule['id'] == f'agents/x.md:1:{guard}'


def test_prose_only_grammar():
    assert only_rule('<!-- prose-only:  judged by readers  -->') == {
        'id': 'agents/x.md:1:prose-only',
        'kind': 'prose_only',
        'guard': None,
        'stage': None,
        'action': None,
        'settings': {},
        'reason': 'judged by readers',
        'source': {'file': 'agents/x.md', 'line': 1},
        'text': 'Keep it short.',
    }


@pytest.mark.parametrize(
    'tag',
    [
        '<!-- enforce: X() -->',
        '<!-- enforce: 9x() -->',
        '<!-- enforce: _x() -->',
        '<!-- enforce: x -->',
        '<!-- enforce: x( -->',
        '<!-- enforce: x) -->',
        '<!-- enforce: () -->',
        '<!-- enforce x() -->',
        '<!-- enforce: x(a) -->',
        '<!-- enforce: x(a=) -->',
        '<!-- enforce: x(=1) -->',
        '<!-- enforce: x(a=1,) -->',
        '<!-- enforce: x(,) -->',
        '<!-- enforce: x(a=1 b=2) -->',
        '<!-- enforce: x(A=1) -->',
        '<!-- enforce: x(a=1, a=2) -->',
        '<!-- enforce: x(stage=final, stage=final) -->',
        '<!-- enforce: x(a=[[1]]) -->',
        '<!-- enforce: x(a=[1,]) -->',
        '<!-- enforce: x(a=[1) -->',
        '<!-- enforce: x(a="open) -->',
        '<!-- enforce: x(a="bad \\n escape") -->',
        "<!-- enforce: x(a='q') -->",
        '<!-- enforce: x(a=1.5) -->',
        '<!-- enforce: x(a=12ab) -->',
        '<!-- enforce: x() y() -->',
        '<!-- enforce: x() trailing -->',
        '<!-- enforce: x(a=__import__) extra) -->',
        '<!-- enforce: x()',
        '<!-- prose-only: -->',
        '<!-- prose-only:    -->',
        '<!-- prose-only -->',
        '<!-- prose-only reason -->',
        '<!-- enforce: x(a=' + '9' * 5000 + ') -->',
        '<!-- enforce: x(a=[1, -' + '9' * 5000 + ']) -->',
    ],
)
def test_malformed_tags(tag):
    parsed = parse_rules('Keep it short. ' + tag + '\n', 'agents/x.md')
    assert parsed['rules'] == []
    assert parsed['issues'] == [
        {
            'code': 'enforce-malformed',
            'severity': 'error',
            'location': '$.body',
            'message': 'agents/x.md:1: ' + MALFORMED,
        }
    ]


@pytest.mark.parametrize('value', ['later', '"final"', '1', '[final]', 'FINAL'])
def test_unknown_stage_never_echoes_the_value(value):
    issues = parse_rules(f'Rule. <!-- enforce: x(stage={value}) -->', 'a.md')['issues']
    assert [i['code'] for i in issues] == ['enforce-unknown-stage']
    assert issues[0]['message'] == 'a.md:1: unknown stage; accepted: before_tool, after_tool, before_answer, final'


@pytest.mark.parametrize('value', ['skip', '"fix"', '0', '[fail]', 'Retry'])
def test_unknown_action_never_echoes_the_value(value):
    issues = parse_rules(f'Rule. <!-- enforce: x(on_violation={value}) -->', 'a.md')['issues']
    assert [i['code'] for i in issues] == ['enforce-unknown-action']
    assert issues[0]['message'] == 'a.md:1: unknown on_violation; accepted: fix, retry, fail'


@pytest.mark.parametrize(
    'text',
    [
        '<!-- note -->',
        '<!-- enforcement notes -->',
        '<!-- enforce-later -->',
        '<!-- Enforce: x() -->',
        '<!-- prose-onlyish -->',
        'enforce: x()',
    ],
)
def test_other_comments_are_not_tags(text):
    body = 'Rule. ' + text + '\n'
    assert not has_tags(body)
    assert strip_tags(body) is body
    assert parse_rules(body, 'a.md') == {'rules': [], 'issues': []}


@pytest.mark.parametrize(
    'body',
    [
        '```\nRule. <!-- enforce: x() -->\n```\n',
        '~~~md\nRule.\n<!-- enforce: x() -->\n~~~\n',
        'Intro.\n\n    Rule. <!-- enforce: x() -->\n',
        'Write `<!-- enforce: x() -->` after a rule.\n',
        'Write ``a ` <!-- prose-only: why --> b`` after a rule.\n',
    ],
)
def test_tags_in_code_are_examples(body):
    # The pre-check is lexical; parsing then excludes code.
    assert has_tags(body)
    assert strip_tags(body) is body
    assert parse_rules(body, 'a.md') == {'rules': [], 'issues': []}


@pytest.mark.parametrize(
    'body,guards,stripped',
    [
        (r'Rule. \` <!-- enforce: g() --> \`', ['g'], r'Rule. \` \`'),
        ('Rule. <!-- enforce: a(note="`") --> <!-- enforce: b() --> `\n',
         ['a', 'b'], 'Rule. `\n'),
        ('Rule. <!-- note: ` --> <!-- enforce: g() --> `\n',
         ['g'], 'Rule. <!-- note: ` --> `\n'),
        ('Rule [label](foo "`") <!-- enforce: g() --> `\n',
         ['g'], 'Rule [label](foo "`") `\n'),
        ('Rule [label](foo`bar) <!-- enforce: g() --> `\n',
         ['g'], 'Rule [label](foo`bar) `\n'),
        ('Rule <https://example.com/`> <!-- enforce: g() --> `\n',
         ['g'], 'Rule <https://example.com/`> `\n'),
    ],
)
def test_literal_backticks_do_not_hide_tags(body, guards, stripped):
    parsed = parse_rules(body, 'a.md')
    assert parsed['issues'] == []
    assert [rule['guard'] for rule in parsed['rules']] == guards
    assert strip_tags(body) == stripped


def test_code_in_link_and_image_labels_remains_an_example():
    body = ('A prefix longer than the image label itself. '
            '![`<!-- enforce: example() -->`](image) '
            '[`<!-- enforce: linked() -->`](page) <!-- enforce: g() -->\n')
    parsed = parse_rules(body, 'a.md')
    assert parsed['issues'] == []
    assert [rule['guard'] for rule in parsed['rules']] == ['g']
    assert strip_tags(body) == ('A prefix longer than the image label itself. '
                                '![`<!-- enforce: example() -->`](image) '
                                '[`<!-- enforce: linked() -->`](page)\n')


@pytest.mark.parametrize('fence', ['```', '~~~'])
def test_unclosed_standalone_tag_preserves_following_code_fence(fence):
    body = f'Rule.\n<!-- enforce: broken(\n{fence}\nnot a --> b\n{fence}\nAfter.\n'
    assert strip_tags(body) == f'Rule.\n{fence}\nnot a --> b\n{fence}\nAfter.\n'
    parsed = parse_rules(body, 'a.md')
    assert parsed['rules'] == []
    assert [issue['code'] for issue in parsed['issues']] == ['enforce-malformed']


def test_complete_standalone_tag_preserves_following_indented_code():
    body = 'Rule.\n<!-- enforce: g() -->\n    Example <!-- enforce: sample() -->\n'
    parsed = parse_rules(body, 'a.md')
    assert parsed['issues'] == []
    assert [rule['guard'] for rule in parsed['rules']] == ['g']
    assert strip_tags(body) == 'Rule.\n    Example <!-- enforce: sample() -->\n'


def test_complete_standalone_tag_preserves_thematic_break_classification():
    body = 'Rule.\n<!-- enforce: g() -->\n---\n'
    parsed = parse_rules(body, 'a.md')
    assert parsed['issues'] == []
    assert [(rule['guard'], rule['text']) for rule in parsed['rules']] == [('g', 'Rule.')]


def test_unclosed_tag_recovers_at_another_opening_on_the_same_line():
    body = 'Rule. <!-- enforce: broken( <!-- enforce: good() -->\n'
    parsed = parse_rules(body, 'a.md')
    assert [issue['code'] for issue in parsed['issues']] == ['enforce-malformed']
    assert [(rule['guard'], rule['text']) for rule in parsed['rules']] == [('good', 'Rule.')]
    assert strip_tags(body) == 'Rule.\n'


def test_same_line_ordinary_comment_stops_cross_line_recovery():
    body = 'Rule. <!-- enforce: broken( <!-- note -->\nTail --> stays.\n'
    assert strip_tags(body) == 'Rule.<!-- note -->\nTail --> stays.\n'
    assert [issue['code'] for issue in parse_rules(body, 'a.md')['issues']] == ['enforce-malformed']


def test_comment_opening_in_a_quoted_setting_is_not_a_recovery_boundary():
    body = 'Rule. <!-- enforce: g(note="<!-- example") -->\n'
    parsed = parse_rules(body, 'a.md')
    assert parsed['issues'] == []
    assert [(rule['guard'], rule['settings']) for rule in parsed['rules']] == [
        ('g', {'note': '<!-- example'})
    ]
    assert strip_tags(body) == 'Rule.\n'


@pytest.mark.parametrize('prefix', ['- > ', '> - > ', '- - ', '1. > - '])
def test_nested_markdown_markers_are_removed_from_rule_text(prefix):
    parsed = parse_rules(prefix + 'Rule. <!-- enforce: g() -->\n', 'a.md')
    assert parsed['issues'] == []
    assert [rule['text'] for rule in parsed['rules']] == ['Rule.']


@pytest.mark.parametrize('prefix', ['- > ', '> - > ', '- - ', '1. > - '])
def test_empty_nested_markdown_items_are_not_rule_sentences(prefix):
    parsed = parse_rules(prefix + '<!-- enforce: g() -->\n', 'a.md')
    assert parsed['rules'] == []
    assert [issue['code'] for issue in parsed['issues']] == ['enforce-no-rule']


def test_package_exports_the_canonical_parser_and_stripper():
    import prosaic

    assert prosaic.parse_rules is parse_rules and prosaic.strip_tags is strip_tags
    assert not hasattr(prosaic, 'has_tags')
    body = 'Rule. <!-- enforce: x() -->\n'
    assert prosaic.strip_tags(body) == 'Rule.\n'
    assert [rule['id'] for rule in prosaic.parse_rules(body, 'a.md')['rules']] == ['a.md:1:x']


def test_untagged_bodies_are_returned_unchanged():
    body = '# Title\n\nPlain rule.  \r\n<!-- a comment -->\n'
    assert strip_tags(body) is body


@pytest.mark.parametrize(
    'tagged,untagged',
    [
        ('Rule. <!-- enforce: x() -->\nNext.\n', 'Rule.\nNext.\n'),
        ('Rule.\t<!-- enforce: x() --> <!-- enforce: y() -->\n', 'Rule.\n'),
        ('Rule.\n<!-- enforce: x() --> <!-- prose-only: why -->\nNext.\n', 'Rule.\nNext.\n'),
        ('Rule.\r\n  <!-- enforce: x() -->\r\nNext.\r\n', 'Rule.\r\nNext.\r\n'),
        ('Rule. <!-- enforce: x() -->\r\n', 'Rule.\r\n'),
        ('Rule.\n<!-- enforce: x() -->', 'Rule.\n'),
        ('Rule <!-- enforce: x() --> continues.\n', 'Rule continues.\n'),
        ('Rule. <!-- enforce: broken(\n', 'Rule.\n'),
        ('Keep `<!-- enforce: x() -->` here. <!-- enforce: y() -->\n', 'Keep `<!-- enforce: x() -->` here.\n'),
        # A tag left open runs to the next -->, however many lines away.
        ('Rule.\n<!-- enforce: foo(\n  stage=final) -->\nNext.\n', 'Rule.\nNext.\n'),
        ('Rule. <!-- enforce: foo(\r\n  a=1,\r\n  stage=final) -->\r\nNext.\r\n', 'Rule.\r\nNext.\r\n'),
        ('Rule. <!-- prose-only: a\nlong reason --> <!-- enforce: y() -->\nNext.\n', 'Rule.\nNext.\n'),
        # Without a later -->, or when another comment opens first, only the
        # opening line is stripped; a following rule or tag is never swallowed.
        ('Rule. <!-- enforce: x(\nNext line.\n', 'Rule.\nNext line.\n'),
        ('Rule. <!-- enforce: x(\nNext. <!-- enforce: y() -->\n', 'Rule.\nNext.\n'),
        ('Rule. <!-- enforce: x(\nNext.\n<!-- note -->\n', 'Rule.\nNext.\n<!-- note -->\n'),
        # Code ends the search too, so a fence is never unbalanced.
        ('Rule. <!-- enforce: x(\n```\na --> b\n```\nAfter.\n', 'Rule.\n```\na --> b\n```\nAfter.\n'),
    ],
)
def test_strip_tags(tagged, untagged):
    assert strip_tags(tagged) == untagged


def test_a_multi_line_tag_is_one_malformed_issue_and_later_tags_still_bind():
    body = 'Rule.\n<!-- enforce: foo(\n  stage=final) -->\nNext. <!-- enforce: bar() -->\n'
    parsed = parse_rules(body, 'a.md')
    assert [(i['code'], i['message'].split(':')[1]) for i in parsed['issues']] == [('enforce-malformed', '2')]
    assert [(r['id'], r['text']) for r in parsed['rules']] == [('a.md:4:bar', 'Next.')]
    unclosed = parse_rules('One. <!-- enforce: x(\nTwo. <!-- enforce: y() -->\n', 'a.md')
    assert [i['code'] for i in unclosed['issues']] == ['enforce-malformed']
    assert [(r['id'], r['text']) for r in unclosed['rules']] == [('a.md:2:y', 'Two.')]


def test_oversized_integers_are_reported_not_raised(tmp_path):
    from prosaic import inspect_artifact, validate_artifact_definition, validate_project

    body = 'Rule. <!-- enforce: x(a=' + '9' * 5000 + ') -->\n'
    write(tmp_path, 'rules/huge.md', body)
    write(tmp_path, 'rules/fine.md', 'Fine.\n')
    report = validate_project(tmp_path, {'targets': []})
    assert [(i['code'], i['artifactId']) for i in report['issues']] == [('enforce-malformed', 'rules/huge.md')]
    assert report['artifactCount'] == 2
    data = inspect_artifact(tmp_path, 'rules/huge.md')['data']
    assert data['rules'] == [] and [i['code'] for i in data['ruleIssues']] == ['enforce-malformed']
    assert validate_artifact_definition('rule', {}, body=body) == {
        'ok': False,
        'field': 'body',
        'reason': 'body:1: ' + MALFORMED,
    }


def test_tags_in_bundle_resources_are_stripped_for_every_target():
    from prosaic.pipeline import run_pipeline
    from prosaic.registry import builtin_registry

    content = '# Guide\n\nAsk first. <!-- enforce: ask_first() -->\n<!-- prose-only: why -->\n'
    artifact = {
        'id': 'skills/s/SKILL.md',
        'type': 'skill',
        'frontmatter': {'name': 's', 'description': 'd'},
        'body': 'Body.\n',
        'sourcePath': 'skills/s/SKILL.md',
        'bundleRoot': 'skills/s',
        'resources': [{'relPath': 'guide.md', 'content': content}],
    }
    for descriptor in builtin_registry():
        if descriptor['capabilities']['skill']:
            resources = run_pipeline(artifact, descriptor)['resources']
            assert [r['content'] for r in resources] == ['# Guide\n\nAsk first.\n']
    assert artifact['resources'][0]['content'] == content


def test_non_markdown_resources_pass_through_byte_for_byte():
    from prosaic.enforcement import resource_issues
    from prosaic.pipeline import run_pipeline
    from prosaic.registry import get_target

    script = 'MARKER = "<!-- enforce: foo("\ndef run(): ...\nx = a --> b\n'
    resources = [
        {'relPath': 'guide.md', 'content': 'Ask first. <!-- enforce: ask_first() -->\n'},
        {'relPath': 'helper.py', 'content': script},
    ]
    artifact = {
        'id': 'skills/s/SKILL.md',
        'type': 'skill',
        'frontmatter': {'name': 's', 'description': 'd'},
        'body': 'Body.\n',
        'sourcePath': 'skills/s/SKILL.md',
        'bundleRoot': 'skills/s',
        'resources': resources,
    }
    rendered = run_pipeline(artifact, get_target('claude-code'))['resources']
    assert [r['content'] for r in rendered] == ['Ask first.\n', script]
    assert [i['message'].split(':')[0] for i in resource_issues('skills/s', resources)] == ['skills/s/guide.md']


def test_discovery_never_loads_non_markdown_files_as_resources(tmp_path):
    from prosaic import inspect_artifact

    write(tmp_path, 'skills/x/SKILL.md', '---\nname: x\ndescription: d\n---\nBody.\n')
    write(tmp_path, 'skills/x/helper.py', 'MARKER = "<!-- enforce: foo("\n')
    write(tmp_path, 'skills/x/notes.md', 'Notes.\n')
    data = inspect_artifact(tmp_path, 'skills/x/SKILL.md')['data']
    assert [r['relPath'] for r in data['resources']] == ['notes.md']


def test_rule_text_is_the_bound_line_without_markers_or_tags():
    body = (
        '> - Quoted rule. <!-- enforce: a() -->\n'
        '12) Numbered rule.\n<!-- enforce: b() -->\n'
        '  * Starred rule <!-- enforce: c() --> stays whole.\n'
    )
    assert [
        (r['guard'], r['source']['line'], r['text']) for r in parse_rules(body, 'a.md', line_offset=3)['rules']
    ] == [('a', 4, 'Quoted rule.'), ('b', 6, 'Numbered rule.'), ('c', 7, 'Starred rule stays whole.')]


def test_paragraph_continuation_and_setext_heading_lines():
    body = 'First line of a paragraph\nsecond line is a rule. <!-- enforce: a() -->\n\nTitle\n=====\n<!-- enforce: b() -->\n'
    parsed = parse_rules(body, 'a.md')
    assert [r['text'] for r in parsed['rules']] == ['second line is a rule.']
    assert [(i['code'], i['message'].split(':')[1]) for i in parsed['issues']] == [('enforce-no-rule', '6')]


def test_tag_after_a_code_block_has_no_rule_sentence():
    issues = parse_rules('```\ncode\n```\n<!-- enforce: x() -->\n', 'a.md')['issues']
    assert [i['code'] for i in issues] == ['enforce-no-rule']


def test_order_is_line_then_column():
    body = 'One. <!-- enforce: z() --> <!-- enforce: a() -->\nTwo. <!-- enforce: m() -->\n'
    assert [r['id'] for r in parse_rules(body, 'f.md')['rules']] == ['f.md:1:z', 'f.md:1:a', 'f.md:2:m']


def test_parsing_never_evaluates(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError('evaluation attempted')

    monkeypatch.setattr(builtins, 'eval', refuse)
    monkeypatch.setattr(builtins, 'exec', refuse)
    rules = parse_rules('Rule. <!-- enforce: x(a=__import__, b="os.system(1)", c=[open, 1]) -->', 'a.md')['rules']
    assert rules[0]['settings'] == {'a': '__import__', 'b': 'os.system(1)', 'c': ['open', 1]}


def test_definition_validation_checks_an_optional_body():
    from prosaic import validate_artifact_definition

    frontmatter = {'name': 'reader', 'description': 'Read prose'}
    assert validate_artifact_definition('subagent', frontmatter, body='Rule. <!-- enforce: x() -->\n') == {
        'ok': True,
        'frontmatter': frontmatter,
    }
    assert validate_artifact_definition('subagent', frontmatter, body='Rule.\n<!-- enforce: x(stage=soon) -->') == {
        'ok': False,
        'field': 'body',
        'reason': 'body:2: unknown stage; accepted: before_tool, after_tool, before_answer, final',
    }
    assert validate_artifact_definition(
        'subagent', frontmatter, body='<!-- prose-only: why -->', source_path='agents/reader.md'
    ) == {
        'ok': False,
        'field': 'body',
        'reason': 'agents/reader.md:1: tag has no rule sentence; '
        'place it on a rule line or the line directly after one',
    }
    assert validate_artifact_definition('subagent', {'name': 'reader'}, body='<!-- enforce: X -->') == {
        'ok': False,
        'field': 'description',
        'reason': 'subagent requires a description',
    }
    assert validate_artifact_definition('rule', {}, body=1) == {
        'ok': False,
        'field': 'body',
        'reason': 'Expected string, received number',
    }
    assert validate_artifact_definition('rule', {}, body='Rule.', source_path=1) == {
        'ok': False,
        'field': 'source_path',
        'reason': 'Expected string, received number',
    }


def write(root, relative, text):
    path = root / '.prosaic' / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def test_inspect_accepts_a_guard_nothing_has_registered(tmp_path):
    from prosaic import inspect_artifact

    write(
        tmp_path,
        'subagents/lantern.md',
        '---\nname: lantern\ndescription: Light the path\n---\n'
        'Never guess a trail name. <!-- enforce: never_registered_guard_zz(mode=strict) -->\n',
    )
    result = inspect_artifact(tmp_path, 'subagents/lantern.md')
    assert result['ok'], result
    assert [r['id'] for r in result['data']['rules']] == ['subagents/lantern.md:5:never_registered_guard_zz']
    assert result['data']['ruleIssues'] == []


def test_a_guard_may_be_bound_once_in_each_file(tmp_path):
    from prosaic import inspect_artifact, validate_project

    for name in ('porch-greeter', 'gate-warden'):
        write(
            tmp_path,
            f'subagents/{name}.md',
            f'---\nname: {name}\ndescription: Greet visitors\n---\n'
            'Keep voices low after dusk. <!-- enforce: quiet_hours(stage=before_answer) -->\n',
        )
    report = validate_project(tmp_path, {'targets': []})
    assert report['valid'] and report['issues'] == []
    ids = []
    for artifact_id in ('subagents/gate-warden.md', 'subagents/porch-greeter.md'):
        data = inspect_artifact(tmp_path, artifact_id)['data']
        assert data['ruleIssues'] == []
        ids += [rule['id'] for rule in data['rules']]
    assert ids == ['subagents/gate-warden.md:5:quiet_hours', 'subagents/porch-greeter.md:5:quiet_hours']


def test_inspect_counts_bom_and_crlf_frontmatter_lines(tmp_path):
    from prosaic import inspect_artifact

    write(tmp_path, 'rules/lamp.md', '\ufeff---\r\ndescription: Lamp\r\n---\r\n\r\nRule. <!-- enforce: x() -->\r\n')
    assert inspect_artifact(tmp_path, 'rules/lamp.md')['data']['rules'][0]['source'] == {
        'file': 'rules/lamp.md',
        'line': 5,
    }


def test_tags_only_inside_code_keep_the_legacy_inspection_shape(tmp_path):
    from prosaic import inspect_artifact

    write(tmp_path, 'rules/doc.md', 'Use `<!-- enforce: x() -->` after a rule.\n')
    assert set(inspect_artifact(tmp_path, 'rules/doc.md')['data']) == {
        'id',
        'type',
        'frontmatter',
        'body',
        'bundleRoot',
        'resources',
    }


def test_validation_messages_omit_rejected_values_and_prose(tmp_path):
    from prosaic import validate_project

    write(
        tmp_path,
        'rules/canary.md',
        'SECRET_PROSE_CANARY. <!-- enforce: x(stage=SECRET_STAGE_CANARY, '
        'on_violation=SECRET_ACTION_CANARY) -->\n<!-- enforce: SECRET_NAME_CANARY() -->\n',
    )
    report = validate_project(tmp_path, {'targets': []})
    assert [i['code'] for i in report['issues']] == [
        'enforce-malformed',
        'enforce-unknown-action',
        'enforce-unknown-stage',
    ]
    assert 'CANARY' not in json.dumps(report)
    assert all(i['location'] == '$.body' and i['message'].startswith('rules/canary.md:') for i in report['issues'])


def test_enforcement_module_adds_no_dependency_or_dynamic_execution():
    declared = tomllib.loads((ROOT / 'pyproject.toml').read_text())['project']['dependencies']
    assert declared == ['PyYAML>=6.0', 'pyuca>=1.2', 'markdown-it-py>=3.0,<5']
    tree = ast.parse((ROOT / 'src/prosaic/enforcement.py').read_text())
    imported = {
        alias.name.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names
    }
    imported |= {
        node.module.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module
    }
    # markdown-it-py is an existing dependency, already used for CommonMark validation.
    assert imported <= {'re', 'markdown_it'}
    called = {node.func.id for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)}
    assert not called & {'eval', 'exec', 'compile', '__import__', 'getattr', 'globals', 'locals'}
