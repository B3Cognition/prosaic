import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

from prosaic.config import resolve_config
from prosaic.lifecycle import apply

ROOT=Path(__file__).resolve().parents[1]
CLI=ROOT/'.venv/bin/prosaic'
TS=ROOT/'.reference/dist/cli/index.js'


def run(executable,args,cwd,env=None):
    return subprocess.run([*executable,*args],cwd=cwd,env={**os.environ,'NO_COLOR':'1',**(env or {})},capture_output=True,text=True)


@pytest.mark.parametrize('args', [
    ['--help'],['inspect','--help'],['resolve','--help'],['package','--help'],
    ['inspect','rules/a.md','--target','claude-code'],['inspect'],['resolve','x'],
    ['apply','--unknown'],['blah'],['apply','extra'],['inspect','x','y'],
    ['apply','--lossy','bad'],['package'],['package','blah'],['apply','--json'],
    ['--types','rule','apply'],['inspect','missing'],['inspect','rules/a.md','--json'],
    ['resolve','rules/a.md','--target','claude-code'],['apply','--targets','all','--dry-run'],
    ['apply','--dry-run','--color'],['apply','--dry-run','--no-color'],
    ['import','--dry-run','--format','missing'],['import','--dry-run','--color'],
])
def test_cli_contract(tmp_path,args):
    if not shutil.which('node') or not TS.exists():
        pytest.skip('reference not available')
    source=tmp_path/'.prosaic/rules/a.md'
    source.parent.mkdir(parents=True)
    source.write_text('---\ndescription: a\n---\nA rule\n')
    foreign=tmp_path/'.clinerules/foreign.md'
    foreign.parent.mkdir()
    foreign.write_text('---\nname: foreign\n---\n\nBody\n')
    expected=run(['node',str(TS)],args,tmp_path)
    actual=run([str(CLI)],args,tmp_path)
    assert (actual.returncode,actual.stdout,actual.stderr)==(expected.returncode,expected.stdout,expected.stderr)


@pytest.mark.parametrize('retention',[0.0,1.0,3.0])
def test_integral_float_backup_retention(tmp_path,retention):
    source=tmp_path/'.prosaic/rules/a.md'
    source.parent.mkdir(parents=True)
    source.write_text('one\n')
    (tmp_path/'prosaic.config.yaml').write_text(f'targets: [claude-code]\nbackupRetention: {retention}\n')
    assert type(resolve_config(tmp_path)['backupRetention']) is int
    apply(tmp_path)
    source.write_text('two\n')
    report=apply(tmp_path)
    assert report['overwritten']==1
    assert len(list((tmp_path/'.prosaic-backups').rglob('*.bak.*')))<=int(retention)
