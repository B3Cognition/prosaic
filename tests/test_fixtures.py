"""Static committed golden files, independent of either live serializer."""
from pathlib import Path
import shutil

import pytest

from prosaic.importing import neutralize, validate_gate, round_trip
from prosaic.pipeline import run_pipeline
from prosaic.registry import builtin_registry, get_target

FIXTURES = Path(__file__).resolve().parents[1] / '.reference/conformance-fixtures'
REPRESENTATIVE = {
    'rule': {'id':'rules/style-guide.md','type':'rule','frontmatter':{'description':'House code style guidance.'},
             'body':'# Style Guide\n\nPrefer clarity over cleverness.\n','sourcePath':'rules/style-guide.md'},
    'command': {'id':'commands/deploy.md','type':'command','frontmatter':{'description':'Deploy the app.'},
                'body':'Deploy using the arguments {{args}} and report status.\n','sourcePath':'commands/deploy.md'},
    'skill': {'id':'skills/greeter/SKILL.md','type':'skill','frontmatter':{'name':'greeter','description':'Greet the user warmly.'},
              'body':'Greet the user. See [reference](./reference.md).\n','sourcePath':'skills/greeter/SKILL.md',
              'bundleRoot':'skills/greeter','resources':[{'relPath':'reference.md','content':'# Reference\n\nGreeting templates.\n'}]},
    'subagent': {'id':'subagents/reviewer.md','type':'subagent','frontmatter':{'name':'reviewer','description':'Reviews code for bugs.'},
                 'body':'# Reviewer\n\nReview the diff and report issues.\n','sourcePath':'subagents/reviewer.md'},
}
PAIRS=[(d,k) for d in builtin_registry() for k in REPRESENTATIVE if d['capabilities'][k]]


@pytest.mark.parametrize('descriptor,kind',PAIRS,ids=[d['id']+'-'+k for d,k in PAIRS])
def test_pinned_generated_files(descriptor,kind):
    if not FIXTURES.exists():
        pytest.skip('reference fixtures not bootstrapped')
    directories=list(FIXTURES.glob('*/'+descriptor['id']+'/'+kind))
    assert len(directories)==1, f'missing pinned fixture: {descriptor["id"]}/{kind}'
    result=run_pipeline(REPRESENTATIVE[kind],descriptor)
    for file in [{'path':result['path'],'content':result['content']},*result['companions'],*result['resources']]:
        golden=directories[0]/file['path']
        assert golden.is_file(),f'missing pinned file: {golden}'
        assert file['content'].encode()==golden.read_bytes()


@pytest.mark.parametrize('target', ['claude-code','cursor','windsurf','cline','roo-code','codex-cli','gemini-cli','goose','github-copilot'])
def test_hand_authored_foreign_roundtrip(tmp_path,target):
    folder=FIXTURES/'import-foreign'/target
    if not folder.exists():
        pytest.skip('reference fixtures not bootstrapped')
    shutil.copytree(folder,tmp_path,dirs_exist_ok=True)
    descriptor=get_target(target)
    extension=descriptor['extension']
    primaries=[p for p in tmp_path.rglob('*') if p.is_file() and p.name.endswith(extension)]
    assert primaries
    for primary in primaries:
        relative=primary.relative_to(tmp_path).as_posix()
        outcome=neutralize(str(primary),relative,descriptor,str(tmp_path))
        assert outcome['ok'],outcome
        artifact=outcome['result']['artifact']
        gated=validate_gate(artifact,relative)
        assert gated['ok'],gated
        report=round_trip(gated['artifact'],descriptor,primary.read_text(),relative)['result']
        assert report['verified'] and report['fidelity']=='fully-invertible',report
        assert report['diffRegions']==[]
