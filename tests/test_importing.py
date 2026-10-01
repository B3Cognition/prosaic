import json
import shutil
import subprocess
from pathlib import Path

import pytest

from prosaic.importing import (import_run, neutralize, build_inverse_map, write_source,
                               format_run_summary, format_portability_report)
from prosaic.pipeline import run_pipeline
from prosaic.registry import builtin_registry, get_target

REFERENCE = Path(__file__).resolve().parents[1] / '.reference' / 'dist'


def oracle(script, value):
    if not shutil.which('node') or not REFERENCE.is_dir():
        pytest.skip('frozen TypeScript oracle unavailable')
    source = 'const root=' + json.dumps(str(REFERENCE)) + ';const input=JSON.parse(require("fs").readFileSync(0,"utf8"));' + script
    result = subprocess.run(['node', '-e', source], input=json.dumps(value), text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def snapshot(directory):
    return {str(p.relative_to(directory)): p.read_bytes() for p in directory.rglob('*') if p.is_file()}


@pytest.mark.parametrize('kind', ['rule', 'command', 'skill', 'subagent'])
def test_all_descriptors_import_report_and_source_bytes(tmp_path, kind):
    """Every descriptor exercises its native serialization, inverse and write path."""
    for desc in builtin_registry():
        root = tmp_path / desc['id']
        root.mkdir()
        artifact = {'id': f'{kind}s/check.md', 'type': kind, 'sourcePath': f'{kind}s/check.md',
                    'frontmatter': {'name': 'Check', 'description': 'Verify this fixture',
                                    'tools': ['Read'], 'color': 'blue'},
                    'body': 'Perform {{args}}\n'}
        output = run_pipeline(artifact, desc)
        primary = root / output['path']
        primary.parent.mkdir(parents=True, exist_ok=True)
        primary.write_text(output['content'])
        for companion in output['companions']:
            destination = root / companion['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(companion['content'])
        # A focused foreign directory avoids attributing source/config to explicit target.
        foreign_dir = str(primary.parent.relative_to(root))
        options = {'projectRoot': str(root), 'foreignDir': foreign_dir, 'format': desc['id'], 'overwrite': True}
        expected = oracle('console.log(JSON.stringify(require(root+"/import/run.js").importRun(input)))', options)
        expected_files = snapshot(root)
        for generated in (root / '.prosaic').rglob('*') if (root / '.prosaic').exists() else []:
            if generated.is_file():
                generated.unlink()
        actual = import_run(str(root), foreign_dir=foreign_dir, format=desc['id'], overwrite=True)
        assert actual == expected, desc['id']
        assert snapshot(root) == expected_files, desc['id']


def test_detection_failure_and_ambiguity(tmp_path):
    root = str(tmp_path)
    for format_id in (None, 'missing-format'):
        opts = {'projectRoot': root, 'dryRun': True}
        if format_id:
            opts['format'] = format_id
        expected = oracle('console.log(JSON.stringify(require(root+"/import/run.js").importRun(input)))', opts)
        assert import_run(root, format=format_id, dry_run=True) == expected
    for relative in ('.cursor/rules/check.mdc', '.claude/commands/check.md'):
        file = tmp_path / relative
        file.parent.mkdir(parents=True)
        file.write_text('Hello\n')
    for format_id in (None, 'cursor'):
        opts = {'projectRoot': root, 'dryRun': True}
        if format_id:
            opts['format'] = format_id
        expected = oracle('console.log(JSON.stringify(require(root+"/import/run.js").importRun(input)))', opts)
        actual = import_run(root, format=format_id, dry_run=True)
        assert actual == expected
        expected_text = oracle('const r=input;const m=require(root+"/import/report.js");console.log(JSON.stringify([m.formatRunSummary(r),m.formatPortabilityReport(r)]))', expected)
        assert [format_run_summary(actual), format_portability_report(actual)] == expected_text


def test_portability_override_companion_bundle_and_collision(tmp_path):
    primary = tmp_path / '.github/instructions/bundle/check.instructions.md'
    primary.parent.mkdir(parents=True)
    primary.write_text('---\nname: Check\ndescription: Read ./docs/test.md\ncustom: true\n---\n\nRead [guide](../guide.md) and /tmp/foo\n')
    primary.with_name('check.metadata.json').write_text('{"extra":"../escape","custom":false}')
    primary.with_name('notes.txt').write_text('[missing](missing.txt)\n')
    opts = {'projectRoot': str(tmp_path), 'foreignDir': '.github/instructions/bundle', 'format': 'github-copilot', 'dryRun': True}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/run.js").importRun(input)))', opts)
    before = snapshot(tmp_path)
    assert import_run(str(tmp_path), foreign_dir=opts['foreignDir'], format=opts['format'], dry_run=True) == expected
    assert snapshot(tmp_path) == before
    # Write once, then preserve user collision on the second import.
    import_run(str(tmp_path), foreign_dir=opts['foreignDir'], format=opts['format'])
    opts['dryRun'] = False
    expected = oracle('console.log(JSON.stringify(require(root+"/import/run.js").importRun(input)))', opts)
    before = snapshot(tmp_path)
    assert import_run(str(tmp_path), foreign_dir=opts['foreignDir'], format=opts['format']) == expected
    assert snapshot(tmp_path) == before


def test_containment_symlink_and_noninjective_map(tmp_path):
    root = tmp_path / 'project'
    outside = tmp_path / 'outside'
    root.mkdir()
    outside.mkdir()
    (root / 'source').symlink_to(outside, target_is_directory=True)
    artifact = {'id': 'rules/test.md', 'type': 'rule', 'sourcePath': 'rules/test.md', 'frontmatter': {}, 'body': 'hello'}
    value = {'artifact': artifact, 'source': str(root / 'source'), 'project': str(root), 'options': {}}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/write/source-writer.js").writeSource(input.artifact,input.source,input.project,input.options)))', value)
    assert write_source(artifact, value['source'], value['project']) == expected
    assert not list(outside.iterdir())
    desc = get_target('claude-code')
    desc['translations'] = {'effort': {'toKey': 'effort', 'valueMap': {'low': 'same', 'high': 'same'}}}
    with pytest.raises(ValueError, match='non-injective'):
        build_inverse_map(desc)


@pytest.mark.parametrize('content', [
    '---\nname: Test\ndescription: valid\ncustom: one\nmode: modified\nmodel: fast\n---\n\nUse TOKEN\n',
    '---\nname: Test\ndescription: 15\n---\n\nBody\n',
    '---\nname: Test\n---\n\nBody\n',
    '---\nname: ""\ndescription: valid\n---\n\nBody\n',
    '---\nname: Test\n',
    '---\n- invalid\n---\nBody\n',
])
def test_custom_inverse_and_schema_failures(tmp_path, content):
    from prosaic.importing import validate_gate
    file = tmp_path / '.claude/commands/Test.md'
    file.parent.mkdir(parents=True)
    file.write_text(content)
    desc = get_target('claude-code')
    desc['frontmatter'] = {'strip': [], 'passthrough': ['name', 'description'], 'inject': {'mode': 'default'}}
    desc['translations'] = {'effort': {'toKey': 'model', 'valueMap': {'high': 'fast', 'low': 'slow'}}}
    desc['argumentToken'] = 'TOKEN'
    inputs = {'abs': str(file), 'rel': '.claude/commands/Test.md', 'descriptor': desc, 'project': str(tmp_path)}
    expected = oracle('const r=require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project);console.log(JSON.stringify(r))', inputs)
    actual = neutralize(inputs['abs'], inputs['rel'], desc, inputs['project'])
    assert actual == expected
    if actual['ok']:
        artifact = actual['result']['artifact']
        # Check both reconstructed command and required-field skill/subagent gates.
        for kind in ['command', 'skill', 'subagent']:
            changed = dict(artifact, type=kind)
            expected_gate = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/validate-gate.js").validateGate(input.artifact,input.foreign)))', {'artifact': changed, 'foreign': inputs['rel']})
            assert validate_gate(changed, inputs['rel']) == expected_gate


@pytest.mark.parametrize('content', ['name: Check\ndescription: Test\nprompt: Hello\n', 'name: Check\ndescription: Test\n', '- not a mapping\n', '', 'null\n', 'name: [bad\n', 'name: one\nname: two\n', 'prompt: Hello\nversion: 1.0.0\nname: Check\ndescription: Test\nnumber: 1.0\n'])
def test_structured_yaml_body_and_normalization(tmp_path, content):
    from prosaic.importing import round_trip
    file = tmp_path / 'foreign' / 'test.yaml'
    file.parent.mkdir()
    file.write_text(content)
    desc = get_target('goose')
    desc.update(format='yaml', extension='.yaml', bodyField='prompt', destinationDir='foreign', slots={})
    inputs = {'abs': str(file), 'rel': 'foreign/test.yaml', 'descriptor': desc, 'project': str(tmp_path)}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project)))', inputs)
    actual = neutralize(inputs['abs'], inputs['rel'], desc, inputs['project'])
    assert actual == expected
    if actual['ok']:
        artifact = actual['result']['artifact']
        expected_rt = oracle('console.log(JSON.stringify(require(root+"/import/verify/round-trip.js").roundTrip(input.artifact,input.descriptor,input.content,input.foreign)))', {'artifact': artifact, 'descriptor': desc, 'content': content, 'foreign': inputs['rel']})
        assert round_trip(artifact, desc, content, inputs['rel']) == expected_rt


@pytest.mark.parametrize('content', ['bad', 'x =', 'x = [', 'x = 1\nx = 2\n', 'x = "bad', 'x = {a=1', '[a\n', 'x= 01\n', 'x = truee\n'])
def test_malformed_toml_diagnostics(tmp_path, content):
    file = tmp_path / 'bad.toml'
    file.write_text(content)
    desc = get_target('gemini-cli')
    inputs = {'abs': str(file), 'rel': 'bad.toml', 'descriptor': desc, 'project': str(tmp_path)}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project)))', inputs)
    assert neutralize(inputs['abs'], inputs['rel'], desc, inputs['project']) == expected


@pytest.mark.parametrize('content', [
    'date = 1979-05-27\ndt = 1979-05-27T07:32:00\ntime = 07:32:00.123456\noffset = 1979-05-27T07:32:00-07:00\nprompt = "Body"\n',
    'date = [1979-05-27  , 1980-01-01  ]\n[nested]\ndt = 1979-05-27T07:32:00.123456\n',
])
def test_toml_temporal_subtypes_reports_and_rendering(tmp_path, content):
    from prosaic.compat import json_compatible
    from prosaic.importing import round_trip, write_source
    file = tmp_path / '.gemini/commands/date.toml'
    file.parent.mkdir(parents=True)
    file.write_text(content)
    desc = get_target('gemini-cli')
    inputs = {'abs': str(file), 'rel': '.gemini/commands/date.toml', 'descriptor': desc, 'project': str(tmp_path)}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project)))', inputs)
    actual = neutralize(inputs['abs'], inputs['rel'], desc, inputs['project'])
    assert json_compatible(actual) == expected
    artifact = actual['result']['artifact']
    expected_rt = oracle('const a=require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project).result.artifact; console.log(JSON.stringify(require(root+"/import/verify/round-trip.js").roundTrip(a,input.descriptor,require("fs").readFileSync(input.abs,"utf8"),input.rel)))', inputs)
    assert round_trip(artifact, desc, content, inputs['rel']) == expected_rt
    expected_written = oracle('const fs=require("fs");const a=require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project).result.artifact; const w=require(root+"/import/write/source-writer.js").writeSource(a,input.project+"/.prosaic",input.project,{}); console.log(JSON.stringify(fs.readFileSync(input.project+"/"+w.destPath,"utf8")))', inputs)
    write_source(artifact, str(tmp_path / '.prosaic'), str(tmp_path), {'overwrite': True})
    assert (tmp_path / '.prosaic' / artifact['sourcePath']).read_text() == expected_written


@pytest.mark.parametrize('content', [
    '@invalid\n', 'x : 1\n', '=2\n', 'x=foo\n', 'x=tru\n', 'x=nax\n', 'x=inx\n',
    'x=[1,"two"]\n', 'x=[1,1.5]\n', 'x={a=1,a=2}\n', 'x=[1 2]\n', 'x={a=1 b=2}\n',
    'x="\\q"\n', 'x="\\uXX00"\n', 'x="\\uD800"\n', 'x="\\U00110000"\n',
    'x="""bad', 'x="tab\x01"\n', 'x=1.\n', 'x=1__2\n', 'x=1e\n', 'x=0x\n', 'x=0b2\n',
    '[x]\n[x]\n', 'x=[]\n[[x]]\n', 'x={}\n[[x.a]]\n',
    'x=12-01-01\n', 'x=1979-5-01\n', 'x=1979-05-01T1:01:01\n', 'x=01:00\n',
    'x=1979-05-01T01:01:01.\n', 'x=1979-05-01T01:01:01+xx:00\n',
])
def test_reference_toml_grammar_errors(tmp_path, content):
    file = tmp_path / 'bad.toml'
    file.write_text(content)
    desc = get_target('gemini-cli')
    inputs = {'abs': str(file), 'rel': 'bad.toml', 'descriptor': desc, 'project': str(tmp_path)}
    expected = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/neutralize.js").neutralize(input.abs,input.rel,input.descriptor,input.project)))', inputs)
    assert neutralize(inputs['abs'], inputs['rel'], desc, inputs['project']) == expected


def test_reference_toml_grammar_broad_corpus():
    from prosaic.import_toml import parse_toml
    from prosaic.compat import json_compatible
    values = ['true', 'false', 'tru', 'False', 'inf', '-inf', '+nan', 'nan', 'in', 'n',
              '0', '1', '-1', '+0', '0e2', '0_1', '+0_1', '01', '0012', '01:01:01',
              '1_', '1__2', '1.e2', '1.0', '0.0', '1e2', '1e+2', '1e-2', '1e_', '1e+_',
              '0x10', '0o7', '0b1', '0x_', '0o8', '0xGG', '-0x1', '0b10_01',
              '""', "''", '"\\n"', '"\\u1234"', '"\\U0001f600"', '"\\uD800"',
              '"""hello\nworld"""', "'''hello\nworld'''", '"""\\  x"""',
              '[1,2]', '[1,2,]', '[[1],["two"]]', '[{},{}]', '[true,false]', '[1,true]',
              '{a=1,}', '{a.b=1,a.c=2}', '{a=1,a.b=2}', '{a={b=1},a.c=2}',
              '1979-05-27', '1979-02-30', '1979-13-01', '0000-01-01', '0000-02-30', '1979-01-1',
              '0000-01-01T07:00:00', '0000-01-01T07:00:00Z', '0000-01-01T00:00:00+07:00',
              '9999-12-31T24:00:00', '9999-12-31T24:00:00Z',
              '1979-05-27T07:32:00', '1979-05-27T24:00:00', '1979-05-27T07:32:00.12345Z',
              '07:32:00', '24:00:00', '07:32:00.123456', '01:60:00', '01:00:60',
              '1979-05-27T07:32:00+07:00', '1979-05-27T07:32:00+24:00',
              '1979-05-27T07:32:00+07', '1979-05-27T07:32:00Zextra']
    documents = ['x=' + value + '\n' for value in values]
    documents += ['[a]\nx=1\n[a.b]\ny=2\n', '[[a]]\nx=1\n[[a]]\nx=2\n',
                  'a.b=1\n[a]\nc=2\n', 'a={}\n[a]\n', 'a.b=1\na.b.c=2\n',
                  '\n\nbad', 'a="😀"\nx=1__2\n', 'x=[1979-05-27]\n', 'x=[07:32:00]\n']
    expected = oracle('const t=require(root+"/../node_modules/@iarna/toml");console.log(JSON.stringify(input.map(s=>{try{return {value:t.parse(s)}}catch(e){return {error:e.message}}})))', documents)
    for document, reference in zip(documents, expected):
        try:
            actual = {'value': json_compatible(parse_toml(document))}
        except Exception as error:
            actual = {'error': str(error)}
        assert actual == reference, document


def test_reference_toml_grammar_mutated_tokens():
    from prosaic.import_toml import parse_toml
    from prosaic.compat import json_compatible
    import random
    tokens = ['true', 'false', '1.25', '1e+5', '0x12', '1979-05-27T07:32:00Z',
              '1979-05-27', '07:32:00.123', '"hello"', "'hello'", '[1,2]', '{a=1,b=2}']
    rng = random.Random(73)
    documents = []
    for _ in range(400):
        token = rng.choice(tokens)
        index = rng.randrange(len(token) + 1)
        mutated = token[:index] + rng.choice('_:.\n#?x0') + token[index:]
        documents.append('x=' + mutated + '\n')
    expected = oracle('const t=require(root+"/../node_modules/@iarna/toml");console.log(JSON.stringify(input.map(s=>{try{return {value:t.parse(s)}}catch(e){return {error:e.message}}})))', documents)
    mismatches = []
    for document, reference in zip(documents, expected):
        try:
            actual = {'value': json_compatible(parse_toml(document))}
        except Exception as error:
            actual = {'error': str(error)}
        if actual != reference:
            mismatches.append((document, actual, reference))
    assert not mismatches, mismatches[:10]
