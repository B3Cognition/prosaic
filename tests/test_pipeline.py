import json
import shutil
import subprocess
from pathlib import Path

import pytest

from prosaic.pipeline import (LossyTransformError, PIPELINE_STAGES, run_pipeline,
                              render_toml_file, render_yaml_file, render_markdown)
from prosaic.registry import (builtin_registry, get_target, runtime_capability_for,
                              parse_descriptor, validate_descriptor, register_target,
                              load_catalog_or_fallback)

REFERENCE = Path(__file__).resolve().parents[1] / '.reference' / 'dist'


def oracle(script, value=None):
    if not shutil.which('node') or not REFERENCE.is_dir():
        pytest.skip('frozen TypeScript oracle unavailable')
    source = 'const root=' + json.dumps(str(REFERENCE)) + ';const input=JSON.parse(require("fs").readFileSync(0,"utf8"));' + script
    proc = subprocess.run(['node', '-e', source], input=json.dumps(value), text=True, capture_output=True, check=True)
    return json.loads(proc.stdout)


def test_descriptor_registry_matches_reference():
    expected = oracle('console.log(JSON.stringify(require(root+"/registry/builtin.js").builtinRegistry().all()))')
    assert builtin_registry() == expected
    assert len(expected) == 40
    assert runtime_capability_for(get_target('claude-code')) == dict.fromkeys(('model', 'reasoningEffort', 'tools', 'executionType'), 'unknown')


@pytest.mark.parametrize('mutation', [None, {}, {'id': ''}, {'id': 3}, {'frontmatter': {}},
                                      {'naming': {}}, {'slots': {'command': {'dir': 'commands', 'naming': {'prefix': 'p'}}}},
                                      {'translations': {'effort': {'toKey': 'effort', 'unknown': True}}},
                                      {'runtimeCapability': {'model': 'accepts'}}, {'format': 'bogus'}])
def test_descriptor_validation_and_defaults(mutation):
    raw = mutation if mutation is None or mutation == {} else {**get_target('claude-code'), **mutation}
    expected = oracle('const d=require(root+"/registry/descriptor.js");const v=d.validateDescriptor(input);console.log(JSON.stringify({validation:v,...(v.ok?{parsed:d.parseDescriptor(input)}:{})}))', raw)
    assert validate_descriptor(raw) == expected['validation']
    if expected['validation']['ok']:
        assert parse_descriptor(raw) == expected['parsed']


def test_registration_and_catalog():
    descriptor = get_target('claude-code')
    descriptor['id'] = 'custom'
    registry = register_target(builtin_registry(), descriptor)
    assert registry.has('custom') and registry.supports('custom', 'skill')
    with pytest.raises(ValueError, match='already exists'):
        register_target(builtin_registry(), get_target('claude-code'))
    assert load_catalog_or_fallback(lambda: {'descriptors': [descriptor], 'version': '2'}) == {
        'descriptors': [descriptor], 'version': {'version': '2', 'rulerParityRef': 'ruler@0.4.0', 'parityBaseline': 35}, 'usedFallback': False}
    assert load_catalog_or_fallback(lambda: {'descriptors': [{}]})['usedFallback']


@pytest.mark.parametrize('artifact_type', ['rule', 'command', 'skill', 'subagent'])
@pytest.mark.parametrize('execution', [None, 'skill', 'command', 'agent'])
def test_every_target_and_type_against_reference(artifact_type, execution):
    artifact = {'id': 'skills/TestBundle', 'type': artifact_type, 'sourcePath': '/src/CheckThing.md',
                'bundleRoot': 'skills/TestBundle',
                'frontmatter': {'name': 'My thing', 'description': 'A "quoted" description', 'type': artifact_type,
                                'capability': 'strong', 'effort': 'high',
                                'tools': ['Read', 'Write'], 'color': 'blue', 'custom': {'enabled': True},
                                'overrides': {'claude-code': {'tools': ['Bash']}}},
                'body': 'Do {{args}} then {{ args }} and $ARGUMENTS {{ARGS}}\n[ok](./docs/a.md) [bad](missing.md)\n  ',
                'resources': [{'relPath': 'docs/a.md', 'content': '[also absent](unknown.md)\n'}]}
    if execution is not None:
        artifact['frontmatter']['execution'] = execution
    expected = oracle('const ds=require(root+"/registry/builtin.js").builtinRegistry().all();console.log(JSON.stringify(ds.map(d=>require(root+"/pipeline/runner.js").runPipeline(input,d))))', artifact)
    assert [run_pipeline(artifact, d) for d in builtin_registry()] == expected


def test_custom_descriptor_translation_naming_companions_and_lossy():
    descriptor = get_target('claude-code')
    descriptor.update(naming={'from': 'name', 'casing': 'kebab', 'prefix': 'pre-'},
                      translations={'capability': {'toKey': 'model', 'valueMap': {'strong': 'best'}},
                                    'effort': {'toKey': 'reasoning'}, 'tools': {'toKey': 'tools'}},
                      companions=[{'nameTemplate': '{name}.txt', 'content': '{name}\n{body}'}])
    descriptor['slots']['command']['naming'] = {'casing': 'snake', 'suffix': '-cmd'}
    descriptor['frontmatter'] = {'strip': ['name'], 'passthrough': ['name', 'title'], 'inject': {'model': 'injected'}}
    artifact = {'id': 'test', 'type': 'skill', 'sourcePath': 'skills/test.md', 'body': '{{args}}\n',
                'frontmatter': {'name': 'CheckFoo.BAR', 'title': 'title', 'execution': 'command',
                                'capability': 'strong', 'tools': ['Read'], 'effort': 'high', 'color': 'blue',
                                'overrides': {'claude-code': {'model': 'overridden'}}}}
    expected = oracle('console.log(JSON.stringify(require(root+"/pipeline/runner.js").runPipeline(input.artifact,input.descriptor)))', {'artifact': artifact, 'descriptor': descriptor})
    trace = []
    assert run_pipeline(artifact, descriptor, trace=trace) == expected
    assert trace == list(PIPELINE_STAGES)
    with pytest.raises(LossyTransformError, match='lossyPolicy=error'):
        run_pipeline(artifact, descriptor, 'error')
    expected_error = oracle('try{require(root+"/pipeline/runner.js").runPipeline(input.artifact,input.descriptor,{lossyPolicy:"error"})}catch(e){console.log(JSON.stringify(e.message))}', {'artifact': artifact, 'descriptor': descriptor})
    with pytest.raises(LossyTransformError) as error:
        run_pipeline(artifact, descriptor, 'error')
    assert str(error.value) == expected_error


@pytest.mark.parametrize('fm,body', [
    ({'count': 10000, 'number': 3.5, 'null': None, 'numbers': [1, 2.5], 'quote': 'a "quote"'}, 'hello\n'),
    ({'tables': [{'name': 'one', 'inner': {'x': True}}, {'name': 'two'}], 'deep': {'nested': {'v': 1}}}, 'multi\nline\n'),
    ({'empty': [], 'obj': {}, 'a': ['x'*40, 'y'*40]}, '"""quote"'),
    ({'quoted': ['a "quote"', 'another'], 'unicode': ['😀' * 15, '😀' * 15], 'nested': [['a "quote"']]}, 'single\n'),
    ({'big': 1000000, 'zero': -0.0, 'float': 0.000001, 'char': '\x00\x01', 'quote': "single' double\"", '😀': 'astral', '\uffff': 'bmp'}, '\ufeff \n'),
])
def test_toml_nested_and_quoting(fm, body):
    expected = oracle('console.log(JSON.stringify(require(root+"/render/toml.js").renderTomlFile(input.fm,input.body,"prompt")))', {'fm': fm, 'body': body})
    assert render_toml_file(fm, body) == expected


@pytest.mark.parametrize('fm,body', [
    ({'name': 'Name', 'description': 'line one\nline two\n', 'title': 'yes', 'model': 'on',
      'color': 'null', 'tools': ['Read', 'Write'], 'Z': 'z', 'a': 'a', '😀': 'astral', '\uffff': 'bmp'}, 'hello \n\ufeff'),
    ({'version': '1.0.0', 'date': '2026-10-01', 'number': '1e6', 'hex': '0xFF', 'null': None,
      'nested': {'array': [{'x': 'one', 'y': 1}, {'x': 'two', 'y': 2}]}}, 'one\ntwo\n'),
    ({'description': 'trailing\n\n', 'true': 'true', 'no': 'no', 'off': 'off', 'float': 0.000001}, '\n'),
])
def test_yaml_order_schema_and_multiline(fm, body):
    expected = oracle('console.log(JSON.stringify({yaml:require(root+"/render/yaml.js").renderYamlFile(input.fm,input.body,"instructions"),markdown:require(root+"/render/markdown.js").renderMarkdown(input.fm,input.body)}))', {'fm': fm, 'body': body})
    assert render_yaml_file(fm, body, 'instructions') == expected['yaml']
    assert render_markdown(fm, body) == expected['markdown']


def test_custom_translation_precedence_and_unmapped_values():
    descriptor = get_target('claude-code')
    descriptor.update(translations={'execution': {'toKey': 'lane'}, 'capability': {'toKey': 'model', 'valueMap': {'strong': 'best'}},
                                    'effort': {'toKey': 'effort', 'valueMap': {'low': 1}},
                                    'tools': {'toKey': 'tools'}, 'color': {'drop': True}},
                      frontmatter={'strip': ['title', 'tools'], 'passthrough': '*', 'inject': {'model': 'default', 'tools': 'default'}})
    artifact = {'id': 'custom', 'type': 'subagent', 'sourcePath': '/agents/check.md', 'body': 'ok\n',
                'frontmatter': {'execution': 'agent', 'capability': 'strong', 'effort': 'unmapped', 'tools': None,
                                'color': 'blue', 'title': 'strip this', 'invocation': 'manual', 'visibility': 'hidden',
                                'overrides': {'claude-code': {'model': None, 'targetValue': False}}}}
    expected = oracle('console.log(JSON.stringify(require(root+"/pipeline/runner.js").runPipeline(input.artifact,input.descriptor)))', {'artifact': artifact, 'descriptor': descriptor})
    assert run_pipeline(artifact, descriptor) == expected
