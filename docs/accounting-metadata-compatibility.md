# Accounting metadata compatibility — 2026-11-08

Runtime0.9.17 adds immutable bounded host `ExecutionContext.request_metadata`
labels visible to recorder prepare before dispatch. Core0.5.0 owns no model,
workflow, recorder or tenant/payer authorization. No Core API/version, parsing,
output layout, artifact digest or published package bytes change for this feature.

Lab0.9.10 qualifies Core0.5.0/Runtime0.9.17/Harness0.9.12 with original published
recorder0.3.0/store0.4.1 and a [copyable host](https://github.com/B3Cognition/prosaic-integration-lab/blob/v0.9.10/docs/accounting-request-metadata.md).
Its [release page](https://github.com/B3Cognition/prosaic-integration-lab/releases/tag/v0.9.10)
is the publication/evidence authority. SDK availability alone does not qualify
a partial mixture. Earlier manifests/profiles stay reproducible unchanged.

None/empty labels preserve exact legacy accounting bytes/hashes. Present labels
intentionally change accounting payload hashes and sealed private saved context/
receipts; artifact/rule, prepared-turn and workflow/bundle identities gain no fields.
Saved Harness labels win over new caller labels/defaults; new variant means new
run. Same-call relabeling conflicts. Accounting uncertainty grants no retry consent.

The published recorder0.3.0 uses Runtime's public decoder and existing JSONB schema:
no DDL/privilege expansion, adapter republish or old-row rewrite. Labeled records
need Runtime>=0.9.17 readers. Labels never authorize identity/scope/rates/billing
or enter provider prompts/body/headers. Hosts own safe labels and public filtering.
See [Runtime's bounds/migration contract](https://github.com/B3Cognition/prosaic-runtime/blob/v0.9.17/docs/accounting.md#request-metadata-v1).

No live-provider or financial certification is implied. Remaining
[Cerebro requests](https://github.com/B3Cognition/prosaic-runtime/blob/v0.9.17/docs/cerebro-requests.md)
include actual sent-effort evidence, a separate explicit repair allowance,
comprehensive versioned identity policy and automated release-note enforcement.
