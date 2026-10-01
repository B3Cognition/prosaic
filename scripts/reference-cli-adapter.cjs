#!/usr/bin/env node
// Verification only: original CLI tests run the installed Python executable.
const {spawnSync}=require('child_process');
const path=require('path');
const executable=process.env.PROSAIC_PY_CLI || path.resolve(__dirname,'../../../.venv/bin/prosaic');
const result=spawnSync(executable,process.argv.slice(2),{cwd:process.cwd(),env:process.env,encoding:'utf8'});
process.stdout.write(result.stdout||'');
process.stderr.write(result.stderr||'');
process.exitCode=result.status===null?1:result.status;
