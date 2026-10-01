# Why direct reads sometimes fail

Diagnosis on 2026-10-01 used TokenProxy/Qwen with synthetic evidence only.
No production parser, Runtime, Harness, prompt, or consumer configuration was
changed. The experiments were independent first-turn requests, not retries or
resumes of blocked workflows; no tool calls from these probes were executed.

## Established findings

The failure is not a general inability to execute tools. Runtime's tool smoke
and Harness's staged acquisition executed `read_file` successfully. Echelon's
Claude/Codex paths also use separate CLI adapters, not this local-model Chat
Completions path.

A fresh raw capture of the failing direct-read request showed:

- `tools` advertised `read_file`, and `tool_choice` explicitly selected it.
- The endpoint returned HTTP 200 with a genuine SSE stream.
- No SSE chunk contained native tool calls; Runtime did not lose a tool call.
- The content was an ordinary JSON answer saying the file had not been read,
  listing missing contents and returning no claims.

Thus this failure happens before host tool execution. There is no filesystem
permission error or failed read operation: no tool invocation arrived.

## Controlled prompt/transport ablations

Each condition was probed twice with the same model, tool schema, arguments,
temperature, and output-token limit. Successful first turns selected `read_file`.
These are small reproductions, not statistical reliability estimates.

| First-turn condition | Native tool calls observed |
| --- | --- |
| Original detailed analysis/JSON-output contract, streaming | 0/2 |
| Same request, non-streaming | 0/2 |
| Same prompt, automatic tool choice | 0/2 |
| Same prompt, `tool_choice: required` | 0/2 |
| Remove only final ban on non-JSON commentary | 0/2 |
| Remove both final formatting rules | 0/2 |
| Append explicit next-turn-only native-call instruction | 0/2 |
| Remove the detailed output-schema section | 2/2 |
| Replace detailed output contract with “after reading, summarize as JSON” | 2/2 |
| Narrow acquisition-only prompt | 2/2 |

The reproduced trigger is the combined direct-read prompt's detailed final-answer
contract. On this endpoint/model, it steers generation into a JSON answer before
the required read—even though the prompt says the schema applies only after a
successful read. Removing a single prohibition or adding more emphatic tool
instructions did not resolve it. Separating acquisition from final analysis did.

Both named and required tool choices failed to enforce a native call in these
cases. Client-side evidence does not identify whether TokenProxy alters the
field or its inference backend fails to enforce it. That attribution requires
forwarded-request/backend logs. It is not justified to blame the model alone.

## Design consequence and proposed direction

Prosaic inspection is not the cause: Python and frozen TypeScript produced the
same artifact digest, Harness fingerprint, and canonical request-body hash.
Runtime's guard correctly blocked advancement when the required call was absent.

The brittle assumption is that the provider will enforce `tool_choice` while
the model handles tool acquisition and a detailed final-answer schema together.
For known required reads, the existing staged-acquisition design avoids that
prompt interaction: send acquisition-only prose first; deliver the analysis and
answer contract after a successful, scoped, hash-verified read. This preserves
real native execution and does not weaken receipt requirements. Explicit
controller preloading is a different, tool-free mode, not an automatic fallback.

If direct mode remains supported, fixing provider-side forced-tool enforcement
and testing this exact prompt are needed. Prompt changes alone should not be
treated as a guaranteed fix. No implementation change was made during diagnosis.

## Evidence

Ignored output directories retain credential-free request bodies, raw responses,
and machine-readable results:

- `parity-results/live-20261001T075120685462Z/`: failing Harness raw wire capture
- `parity-results/tool-choice-diagnosis-20261001T075319040090Z/`: initial 12 probes
- `parity-results/tool-choice-diagnosis-20261001T075509381345Z/`: eight focused probes

The raw failing request still has canonical SHA-256
`d47e602733424c1980968facab9cf521843bd95fc04804bfca94d4c0681ee34f`, matching
the previous Python/TypeScript comparison. Capture never records Authorization
headers. Raw bodies are limited to synthetic examples, and are ignored by Git.
