# Releases and compatibility

Versions checked against published GitHub releases on 2026-11-07.
The latest SDKs and the Lab's qualified dependency train are separate selections.
Harness 0.9.12 uses Runtime 0.9.16 and Core 0.5.0, with declared Runtime floor
`>=0.9.16,<0.10`. Lab 0.9.9 qualifies that exact public train and retains the
original recorder 0.3.0/store 0.4.1 bytes. Earlier Lab profiles keep their own
archived manifests; newer SDK availability never certifies a partial mixture.
This documentation update changes no Core version, package bytes or receipts.

| Component | Latest published version | Scope |
| --- | --- | --- |
| Core (`b3-prosaic`) | 0.5.0 | Canonical Markdown, native outputs and inert rule tags |
| Runtime (`b3-prosaic-runtime`) | 0.9.16 | Per-call OpenAI-compatible headers; includes 0.9.15 fee enforcement |
| Harness (`b3-prosaic-harness`) | 0.9.12 | Workflow enforcement over accepted earlier outputs; Validator V1 retained |
| Runtime PostgreSQL recorder | 0.3.0 | Optional usage persistence; unchanged adapter release |
| Harness PostgreSQL store | 0.4.1 | Optional workflow/session persistence; unchanged adapter release |
| Integration Lab | 0.9.9 | Qualified Core 0.5.0 / Runtime 0.9.16 / Harness 0.9.12 and a V2 blueprint |

Install current SDKs in a fresh environment; pin versions and archive hashes for reproducible deployments. Optional PostgreSQL adapters require explicit provisioning and operator readiness checks. Never co-install legacy and renamed distributions that own the same imports.

Runtime 0.9.15 advances `value_in_tool_output` to `value-in-tool-output-v2`; explicitly readmit affected bindings when upgrading from 0.9.14. Runtime 0.9.16 headers add no identity fields and leave guard versions unchanged. Harness 0.9.12 adds workflow guard admission, accepted dependency facts and bounded durable proof while preserving untagged identities and Validator V1. See its [identity/readmission contract](https://github.com/B3Cognition/prosaic-harness/blob/v0.9.12/docs/workflow-rules.md) and the [Lab guide](https://github.com/B3Cognition/prosaic-integration-lab/blob/v0.9.9/docs/workflow-enforcement.md).

## Published history

Every published version is linked below. Backfilled notes explain changes using that version’s source, without attributing newer features or modern validation results to it. Candidate tags without a published release are not listed as releases.

| Release | Published (UTC) | Notes |
| --- | --- | --- |
| [v0.5.0](https://github.com/B3Cognition/prosaic/releases/tag/v0.5.0) | 2026-11-05 | Published notes |
| [v0.4.1](https://github.com/B3Cognition/prosaic/releases/tag/v0.4.1) | 2026-10-11 | [backfilled notes](release-history/v0.4.1.md) |
| [v0.3.2](https://github.com/B3Cognition/prosaic/releases/tag/v0.3.2) | 2026-10-10 | Published notes |
| [v0.3.1](https://github.com/B3Cognition/prosaic/releases/tag/v0.3.1) | 2026-10-07 | Published notes |
| [v0.3.0](https://github.com/B3Cognition/prosaic/releases/tag/v0.3.0) | 2026-10-01 | Published notes |
| [v0.2.0](https://github.com/B3Cognition/prosaic/releases/tag/v0.2.0) | 2026-10-01 | Published notes |
| [v0.1.0](https://github.com/B3Cognition/prosaic/releases/tag/v0.1.0) | 2026-09-10 | [backfilled notes](release-history/v0.1.0.md) |

## Release-note checklist

For each future publication, write version-specific notes before release: describe changed behavior, dependency floors and the exact qualified train, identity/fingerprint changes and readmission or migration steps, adapter publication versus witness status, and observed validation with its limits. Link the original qualification and public-consumer proof. Never substitute a generic “qualified release” sentence or rewrite historical package bytes to improve documentation.
