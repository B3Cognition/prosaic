# First live Runtime and Harness trial

On 2026-10-01, tested current Runtime
`7698b5c626a5c91dd0aead3f78a8c7d1c9013cd7` and Harness
`a52535a4a055e82eb287a7c5f3846787f5f0f3e1` with the installed Python
Prosaic wheel explicitly first on PATH. Node was absent from the Python trial
PATH. No consumer source, production dependency, or durable run state was edited.

The endpoint was TokenProxy `http://10.16.81.27:8080/v1`, using model
`qwen36-35b-a3b`. All tiers were explicitly routed to Qwen for this bounded
migration trial. The key was loaded from shell configuration into its existing
environment variable; neither its value nor Authorization headers were logged.
Inputs and evidence were checked-in synthetic examples.

| Live case | Result |
| --- | --- |
| Runtime doctor/authenticated model discovery | Passed |
| Runtime streamed no-tool completion | Passed |
| Runtime streamed native `read_file` | Passed, full-file receipt |
| Harness single-agent schema/evidence admission | Completed, two attempts |
| Harness direct required read | Blocked: `tool_choice_not_honored` |
| Harness staged acquisition/schema/evidence admission | Completed, one invocation; 9/9 lines with matching hash |
| Harness tool-free preloaded evidence/schema admission | Completed, one invocation; no native tool event |

## Direct-read diagnosis

The direct-read block was preserved, not retried by resuming or altering its
durable state. Separate fresh diagnostic runs were used. Frozen TypeScript
inspection produced the identical artifact data and digest
`063c29671e2e9eb3cc4e99951b1160c3e77a0b7f3affd5a8ea5a057b9b1e3957`,
and the same Harness workflow fingerprint. One TypeScript run completed; the
audited TypeScript run blocked with the same reason as Python.

The audited first request bodies were semantically identical (canonical JSON
SHA-256 `d47e602733424c1980968facab9cf521843bd95fc04804bfca94d4c0681ee34f`).
They both advertised only `read_file` and explicitly requested it through
`tool_choice`. The failing endpoint responses were HTTP 200 but contained zero
native tool calls. This establishes parity at the model-request boundary for
this reproduced failure; it does not establish reliable forced-tool compliance
by the endpoint. Runtime/Harness correctly refused advancement without the read.
No parser migration defect was identified by this trial.

## Evidence and reproduction

Ignored `parity-results/` retains complete reports, stdout/stderr, controller
run state, attempt receipts, and credential-free request hashes:

- Main Python trial: `live-20261001T072019667035Z/`
- Initial TypeScript comparison: `live-20261001T072231709434Z/`
- Fresh Python direct-read repeat: `live-20261001T072340962702Z/`
- Audited Python direct read: `live-20261001T072445235899Z/`
- Audited TypeScript direct read: `live-20261001T072455441979Z/`

Use current editable Runtime/Harness installs in the candidate environment and
the installed wheel in `.wheel-test` (see README). From this repository:

```sh
source ~/.zshrc
export TOKENPROXY_KEY
.venv/bin/python scripts/verify_live_consumers.py --live --profile qwen
```

`--direct-read-only` runs one new direct-read diagnostic; `--ts-baseline` instead
uses the frozen reference for that case and requires Node only for comparison.
Each command creates a fresh ignored output directory. Request auditing records
only canonical body hashes and tool/model selection, never HTTP headers.

This is a partial live pass, not an all-green endpoint compatibility verdict.
Staged acquisition and preloading work with Python; direct forced-read compliance
remains an endpoint/model limitation requiring its own investigation before
depending on that mode. TypeScript has not been retired.

After adding the credential-free audit regression, the full Python suite passed
413 tests in 35.30 seconds. Production parser/runtime code was not changed for
this live trial.

Follow-up raw-wire capture and 20 controlled first-turn probes isolated the
direct-read failure to interaction with the detailed final-answer contract;
see `tool-choice-diagnosis.md`. The endpoint demonstrably supports native tools,
but neither named nor required tool choice enforced the call in the failing
prompt. Proxy versus inference-backend responsibility remains unestablished.
