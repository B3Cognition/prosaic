"""Reproduce the frozen-reference, shipped-CLI and optional consumer checks."""
from __future__ import annotations

import argparse
import datetime
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

REVISION='5e0423a289342547d1666db484330ac6adb4743a'
ROOT=Path(__file__).resolve().parents[1]


def snapshot(repo,directory,revision=REVISION):
    if directory.exists():
        return
    archive=subprocess.run(['git','-C',str(repo),'archive',revision],check=True,capture_output=True).stdout
    directory.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(directory,filter='data')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-repo',type=Path,default=ROOT)
    parser.add_argument('--consumers',type=Path,nargs='*',default=[])
    parser.add_argument('--freeze-consumers', action='store_true',
                        help='Test committed consumer snapshots, excluding concurrent edits')
    args=parser.parse_args()
    consumer_revisions={}
    if args.freeze_consumers:
        frozen=[]
        for project in args.consumers:
            project=project.resolve()
            revision=subprocess.check_output(['git','-C',str(project),'rev-parse','HEAD'],text=True).strip()
            destination=ROOT/'.consumer-tests'/project.name/revision
            consumer_revisions[project.name]=revision
            destination.parent.mkdir(parents=True,exist_ok=True)
            snapshot(project,destination,revision)
            frozen.append(destination)
        args.consumers=frozen
    results=[]
    environment={**os.environ,'PROSAIC_PY_CLI':str(Path(sys.executable).parent/'prosaic')}

    def check(name,command,cwd=ROOT,env=environment):
        print(f'\n{name}',flush=True)
        started=datetime.datetime.now(datetime.timezone.utc)
        proc=subprocess.run([str(part) for part in command],cwd=cwd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        print(proc.stdout,end='',flush=True)
        results.append({'name':name,'command':[str(part) for part in command],'cwd':str(cwd),
                        'exit_code':proc.returncode,'output':proc.stdout,'started_at':started.isoformat(),
                        'duration_s':(datetime.datetime.now(datetime.timezone.utc)-started).total_seconds()})
        return proc.returncode==0

    success=True
    reference=ROOT/'.reference'
    cli_tests=ROOT/'.cli-tests'
    snapshot(args.reference_repo.resolve(),reference)
    snapshot(args.reference_repo.resolve(),cli_tests)
    if not (reference/'node_modules').exists():
        success=check('Install frozen TypeScript test dependencies',['npm','ci'],reference)
    if success:
        success=check('Build frozen TypeScript reference',['npm','run','build'],reference)
    if success:
        success=check('Python unit, static fixture and differential tests',[sys.executable,'-m','pytest','-q'])
    modules=cli_tests/'node_modules'
    if not modules.exists():
        modules.symlink_to(reference/'node_modules',target_is_directory=True)
    if success:
        success=check('Build isolated original CLI test tree',['npm','run','build'],cli_tests)
    if success:
        shutil.copyfile(ROOT/'scripts/reference-cli-adapter.cjs',cli_tests/'dist/cli/index.js')
        success=check('Original shipped CLI suites through Python',[
            cli_tests/'node_modules/.bin/jest','--runInBand','tests/e2e/cli',
            'tests/e2e/package/cli.test.ts','tests/integration/inspect/cli-inspect.test.ts',
            'tests/integration/resolve/cli-resolve.test.ts','tests/integration/cli/presentation-matrix.test.ts',
            'tests/unit/tool-catalog.test.ts'],cli_tests)
    if success and args.consumers:
        for project in args.consumers:
            project=project.resolve()
            if not check('Install consumer '+project.name,[sys.executable,'-m','pip','install','-e',project,'--no-deps']):
                success=False
                break
        if success:
            success=check('Install consumer validation dependency',[sys.executable,'-m','pip','install','jsonschema>=4.23'])
        consumer_env={**environment,'PATH':str(Path(sys.executable).parent)+os.pathsep+os.environ.get('PATH','')}
        if success:
            for project in args.consumers:
                success=check('Consumer tests using Python Prosaic: '+project.name,[sys.executable,'-m','pytest','-q','tests'],project.resolve(),consumer_env) and success
    report={'reference':REVISION,'consumer_revisions':consumer_revisions,
            'python':sys.version,'success':success,'checks':results,
            'intentional_differences':['Reject dangling symlink escapes','Bound cyclic package symlink traversal']}
    output=ROOT/'parity-results'
    output.mkdir(exist_ok=True)
    report_path=output/'latest.json'
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print(f'\nEvidence: {report_path}')
    return 0 if success else 1


if __name__=='__main__':
    raise SystemExit(main())
