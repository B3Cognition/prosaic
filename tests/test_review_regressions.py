"""Differential regressions from the independent migration review."""
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from prosaic.compat import dump_yaml, json_compatible, stringify_json
from prosaic.config import ConfigError, parse_config
from prosaic.core import ParseError, discover, parse_artifact
from prosaic.importing import extract_body, parse_format
from prosaic.lifecycle import apply
from prosaic.pipeline import render_toml_file
from prosaic.registry import Registry, StaticRegistrySource, get_target


REFERENCE = Path(__file__).resolve().parents[1] / '.reference' / 'dist'


def oracle(script, data):
    if not shutil.which('node') or not REFERENCE.exists():
        pytest.skip('frozen TypeScript oracle unavailable')
    source = 'const root=' + json.dumps(str(REFERENCE)) + ';const input=JSON.parse(require("fs").readFileSync(0,"utf8"));' + script
    result = subprocess.run(['node', '-e', source], input=json.dumps(data), text=True,
                            capture_output=True, check=True)
    return json.loads(result.stdout)


@pytest.mark.parametrize('value', ['-.5', '+.5', '1_', '1__2', '0b_1', '0o_7', '0x_F',
                                    '1_e2', '1._2', '1_.2', '+.nan', '-.nan', '0_1',
                                    '1.0_e3', '0b_', '0x_', '0o_', '9007199254740993'])
def test_numeric_yaml_admission_matches_js_yaml(value):
    raw = '---\ncustom: ' + value + '\n---\nbody'
    expected = oracle('console.log(JSON.stringify(require(root+"/discovery/parse").parseArtifact(input)))', raw)
    assert json_compatible(parse_artifact(raw)) == expected


@pytest.mark.parametrize('value', [1.0, -0.0, 1e-7, 1e20])
def test_numeric_body_extraction_uses_js_json_spelling(value):
    expected = oracle('console.log(JSON.stringify(require(root+"/import/neutralize/extract-body").extractBody({instructions:input},"","instructions","f")))', value)
    assert extract_body({'instructions': value}, '', 'instructions', 'f') == expected


@pytest.mark.parametrize('scalar', ['1979-05-27', '1979-05-27T07:32:00', '1979-05-27T07:32:00Z'])
def test_toml_temporal_json_and_forward_render(scalar):
    raw = 'custom = ' + scalar + '\nprompt = "x"\n'
    expected = oracle('const TOML=require(root+"/../node_modules/@iarna/toml");const doc=TOML.parse(input);console.log(JSON.stringify({json:JSON.stringify(doc),render:require(root+"/render/toml").renderTomlFile(doc,"x","prompt")}))', raw)
    parsed = parse_format(raw, 'toml', 'f')['frontmatter']
    assert stringify_json(parsed) == expected['json']
    assert render_toml_file(parsed, 'x') == expected['render']


def test_bundle_fallback_primary_and_resources_use_locale_order(tmp_path):
    bundle = tmp_path / '.prosaic/skills/example'
    bundle.mkdir(parents=True)
    for name in ('a-b.md', 'a_b.md', 'a.b.md'):
        (bundle / name).write_text('---\nname: Example\ndescription: A valid bundle\n---\n' + name + '\n')
    expected = oracle('console.log(JSON.stringify(require(root+"/discovery/discover").discover(input.sourceRoot,input.projectRoot)))',
                      {'sourceRoot': str(tmp_path / '.prosaic'), 'projectRoot': str(tmp_path)})
    actual = discover(tmp_path / '.prosaic', tmp_path)
    assert actual == expected
    assert actual['artifacts'][0]['sourcePath'] == 'skills/example/a_b.md'
    assert [r['relPath'] for r in actual['artifacts'][0]['resources']] == ['a-b.md', 'a.b.md']


@pytest.mark.parametrize('scalar', ['!!set {a: null, b: null}', '!!omap [{a: 1}, {b: 2}]', '!!binary SGVsbG8='])
def test_admitted_yaml_tag_json_and_yaml_bytes(scalar):
    raw = '---\ncustom: ' + scalar + '\n---\nbody'
    expected = oracle('const p=require(root+"/discovery/parse").parseArtifact(input);console.log(JSON.stringify({json:JSON.stringify(p),yaml:require(root+"/render/yaml").dumpYaml(p.frontmatter)}))', raw)
    parsed = parse_artifact(raw)
    assert stringify_json(parsed) == expected['json']
    assert dump_yaml(parsed['frontmatter']) == expected['yaml']


@pytest.mark.parametrize('scalar', ['!!set {a: 1}', '!!omap [{a: 1}, {a: 2}]',
                                   '!!binary "%%%%"', '!!binary "SGVsbG8"',
                                   '!!binary "SGVsbG8==="', '!!set []',
                                   '!!pairs [{a: 1, b: 2}]'])
def test_malformed_explicit_yaml_tag_rejection(scalar):
    raw = '---\ncustom: ' + scalar + '\n---\nbody'
    expected = oracle('try{require(root+"/discovery/parse").parseArtifact(input);console.log(JSON.stringify({ok:true}))}catch(e){console.log(JSON.stringify({ok:false,message:e.message}))}', raw)
    assert not expected['ok']
    with pytest.raises(ParseError) as error:
        parse_artifact(raw)
    assert str(error.value) == expected['message']


@pytest.mark.parametrize('scalar', ['-0', '-00', '-0x0', '-0o0', '-0b0'])
def test_signed_integer_zero_survives_yaml_render(scalar):
    raw = '---\ncustom: ' + scalar + '\n---\nbody'
    expected = oracle('console.log(JSON.stringify(require(root+"/render/yaml").dumpYaml(require(root+"/discovery/parse").parseArtifact(input).frontmatter)))', raw)
    assert dump_yaml(parse_artifact(raw)['frontmatter']) == expected


@pytest.mark.parametrize('value', [1e-7, 1e20, -0.0])
def test_yaml_number_output_bytes(value):
    expected = oracle('console.log(JSON.stringify(require(root+"/render/yaml").dumpYaml({custom:input})))', value)
    assert dump_yaml({'custom': value}) == expected


def test_injected_registry_manifest_interoperability(tmp_path):
    descriptor = get_target('claude-code')
    descriptor.update(id='review-custom', destinationDir='review-output', slots={})
    version = {'version': 'review-2', 'rulerParityRef': 'review@1', 'parityBaseline': 1}
    registry = Registry(StaticRegistrySource([descriptor], version))
    source = tmp_path / '.prosaic/rules'
    source.mkdir(parents=True)
    (source / 'a.md').write_text('Rule\n')
    expected = oracle('const p=require(root+"/index");const r=new p.Registry(new p.StaticRegistrySource(input.descriptors,input.version));console.log(JSON.stringify(p.apply({projectRoot:input.projectRoot,cli:{targets:["review-custom"]},registry:r,dryRun:true})))',
                      {'projectRoot': str(tmp_path), 'descriptors': [descriptor], 'version': version})
    assert apply(tmp_path, {'targets': ['review-custom']}, dry_run=True, registry=registry) == expected
    apply(tmp_path, {'targets': ['review-custom']}, registry=registry)
    manifest_path = tmp_path / '.prosaic-manifest.json'
    assert json.loads(manifest_path.read_text())['registryVersion'] == 'review-2'
    expected_manifest = oracle('const {Manifest}=require(root+"/manifest/manifest");const {GuardedFs}=require(root+"/write/guarded-fs");console.log(JSON.stringify(Manifest.load(new GuardedFs(input)).serialize()))', str(tmp_path))
    assert manifest_path.read_text() == expected_manifest


@pytest.mark.parametrize('retention', ['0.0', '1.0', '3.0'])
def test_integral_float_retention_completes_overwrite(tmp_path, retention):
    (tmp_path / 'prosaic.config.yaml').write_text('targets: [claude-code]\nbackupRetention: ' + retention + '\n')
    source = tmp_path / '.prosaic/rules'
    source.mkdir(parents=True)
    primary = source / 'a.md'
    primary.write_text('Old\n')
    apply(tmp_path)
    primary.write_text('New\n')
    ts_root = tmp_path.parent / (tmp_path.name + '-oracle')
    shutil.copytree(tmp_path, ts_root)
    expected = oracle('console.log(JSON.stringify(require(root+"/index").apply({projectRoot:input})))', str(ts_root))
    assert apply(tmp_path) == expected
    def snapshot(directory):
        return {str(p.relative_to(directory)): p.read_bytes() for p in directory.rglob('*') if p.is_file()}
    assert snapshot(tmp_path) == snapshot(ts_root)


@pytest.mark.parametrize('raw', [{'artifactTypes': [None]}, {'artifactTypes': [1]}, {'artifactTypes': [{}]},
                                  {'lossyPolicy': None}, {'lossyPolicy': False},
                                  {'packages': [{'id': 'a', 'sourceRoot': 's', 'destinationRoot': 'd', 'x': 1}], 'z': 1}])
def test_config_invalid_types_and_nested_unknown_order(raw):
    expected = oracle('console.log(JSON.stringify(require(root+"/config/schema").parseConfig(input,"review")))', raw)
    with pytest.raises(ConfigError) as error:
        parse_config(raw, 'review')
    assert str(error.value) == expected['message']
