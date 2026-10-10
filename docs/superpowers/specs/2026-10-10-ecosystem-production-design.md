# Prosaic ecosystem production milestones

Date: 2026-10-10
Status: written design under review; implementation has not started.

## Purpose and authorization

Deliver the ecosystem improvements requested after the native workflow factory
release: reliable monitoring, service-facing workflow contracts, generated-workflow
service integration, consequential-tool recovery, invocation budgets, repeatable
releases and normal package-index distribution, provider/scenario qualification,
and Core authoring and concurrent-mutation improvements. Reflect released SDK
changes in the integration lab and release only qualified artifacts.

The user selected a consistent public `b3-prosaic` distribution family. Python
imports, CLI commands, repository names, canonical serialized camelCase contracts,
and existing manifest/checkpoint/receipt formats remain compatible.

Production services are the primary audience. The application remains responsible
for authentication, tenant entitlements, business authorization, HTTP idempotency,
deployment configuration, and operator decisions. Core distributes prose; Runtime
executes models/tools; Harness owns workflow state and orchestration; the lab is a
consumer of public installed APIs.

## Baseline and evidence

Current releases are Core 0.3.2, Runtime 0.7.1 and Harness 0.6.2. The integration
lab 0.2.0 still intentionally selects Core 0.3.1, Runtime 0.7.0 and Harness 0.6.1.
The native factory and its admission boundary already exist and have been tested.
Native Linux AMD64/ARM64 Harness sandbox coverage is now required and passing.

Observed limitations motivating this work:

- Existing `on_event` callbacks are synchronous and propagating. A successful
  Runtime result can be suppressed by a callback exception on `completed`.
  Harness invokes callbacks before committing some transitions and pauses.
- Factory catalogue values have no public policy-projected description API;
  admission error locations are often the unhelpful root `$`.
- Harness operator status returns the full checkpoint. Consumers must build
  their own bounded, private-data-free human interaction projections.
- The lab admits two fixed YAML workflow names; it does not yet qualify native
  generated workflow proposals, persisted proposals or retained native bundles.
- Custom handlers receive only arguments. Per-loop repeated-call protection is
  not durable effect idempotency or evidence that an uncertain effect is safe to
  replay. Callbacks are trusted and cooperatively bounded, not preemptible.
- Runtime bounds rounds, time and input, but lacks aggregate provider-request,
  tool-call and reported-token caps within an invocation.
- SDK dependencies use direct Git URLs; publication remains separate from CI
  builds. A recent corrected source archive demonstrates the need for clean-tag
  builds and tracked-content checks.
- PyPI's `prosaic` name is used by an unrelated project. The five selected
  `b3-prosaic` SDK names currently have no public JSON API listing; successful
  registration still requires PyPI publisher ownership and configuration.
- Core documents concurrent shared-provenance mutations as unsupported and has
  no dedicated read-only project validation command.
- Provider smoke and bounded synthetic load evidence exist. They are not live
  model certification or a deployment capacity, HA/PITR or recovery guarantee.

## Architectural choices

Use additive SDK APIs and a concrete consumer integration. This preserves existing
workflows and keeps authority in host code while exposing enough structure for
client editors and LLM proposal generation.

Alternative: put a transport service, scheduler, tenancy or business operation
journal directly in Harness. This would couple the SDK to deployment and product
policy and conflict with current ownership boundaries.

Alternative: introduce a new universal workflow/runtime framework before proving
the generated service path. This increases migration cost and delays observable
value. Existing admission, schemas, custom tools, stores and receipts provide the
foundation; extend them only where the milestones require it.

## Milestone 1: reliable execution events and released-stack baseline

Add an optional `observer=` channel to Runtime and Harness. Keep existing
`on_event=` propagating semantics for compatibility with callers that deliberately
use a critical hook. Document the distinction and move optional lab monitoring
to the observer channel. Validator, authorization, persistence and cancellation
failures retain their existing critical behavior.

Observer records are versioned, bounded and redacted by construction. Their
default fields are closed event/outcome enums, opaque host correlation references,
digests, finite counts and durations. They contain no prompts, generated text,
credentials, endpoints, filesystem paths or arbitrary exception messages.
Host-added public labels must be explicitly supplied and bounded.

Catch ordinary observer exceptions without changing accepted work. Never swallow
process-control exceptions. Deliver one terminal observer record for every
Runtime result, including cancellation and timeout; this terminal observation
cannot itself discard the result. Emit Harness transition observations after
durable saves, with the committed revision where available. Observer delivery is
best effort, not a durable outbox or an authorization signal.

The initial records have `version=1`, sequence, source, opaque invocation/run
correlation, event type and allowlisted scalar fields. Runtime types cover
invocation, provider request and tool start/end. Unknown model-supplied tool names
become a fixed `unknown` marker. Ordinary observer exceptions are isolated;
observers must remain fast because a hung callback is not preempted. Critical
`on_event` evidence capture is never repurposed as the optional observer.

Acceptance: fault injection at start, completion, waiting and recovery cannot
erase a Result, prevent an otherwise valid committed pause or cause redispatch.
Legacy critical callbacks still propagate. Concurrent invocations do not share
observer context. Event size and safe-field tests cover hostile model output.

If saving a transition instead commits `blocked/state_limit`, its observation
describes that actual committed state and revision rather than the proposed event.

Terminal observation also covers admission failure and critical-hook failure,
using closed outcome/reason codes and a delivery path independent of the existing
cancellation-checking event emitter.

Update the lab's development qualification against candidate wheels using the
new distribution names, then against exact published bytes after release.
Do not install old and renamed distributions into the same environment.

## Milestone 2: the public service contract

The additive public signatures are:

```python
WorkflowCatalog(..., public_metadata=None)
WorkflowFactory.describe(*, include_schemas=False, maximum_bytes=262_144) -> dict
WorkflowFactory.proposal_schema(*, maximum_bytes=262_144) -> dict
Workflow.prepare_inputs(inputs) -> JSONValue
Harness.interaction(*, review_outputs=(), include_response_schema=False,
                    maximum_bytes=262_144) -> PendingInteraction | None
WorkflowBundle(version, factory)
WorkflowBundle.prepare_json(text) -> PreparedWorkflow
WorkflowBundle.reconstruct(proposal_json, reference) -> Workflow
```

`PreparedWorkflow` contains the admitted workflow, canonical original proposal
JSON and an immutable `WorkflowReference`. The reference records its format
version, host bundle version/identity, proposal digest, workflow fingerprint and
admission/schema-profile identifiers. Canonicalize the original accepted envelope
without inserting graph defaults or copying host catalogue content, using compact
UTF-8 JSON with `ensure_ascii=False` and recursively sorted object keys, so
Unicode proposals near the byte ceiling still reconstruct. Persist this exact
canonical text, or reproduce those canonical bytes independently of database JSON
key ordering. Serialized references never hydrate code.

Version the canonicalization recipe as `json-sort-keys-utf8-v1`. Bundle identity
is a versioned SHA-256 digest of canonical immutable agent/schema snapshots,
policy, effective configuration identity, and declared tool/validator semantic
versions, including enabled operation namespace and invocation-cap bindings.
Do not derive it from the public discovery projection alone. Display-only public
metadata is excluded from execution identity. Callback implementation/version
correspondence is a trusted host registration obligation; serialized hashes cannot
establish that correspondence. Same-version altered material and different tenant
policy projections must produce different bundle identities.

`PendingInteraction` is immutable and comes from one verified status snapshot. It
contains run/revision/step references, public question and actual choices,
deadline, response-schema digest, opt-in public schema and explicitly selected
review outputs. Reject oversized views instead of truncating semantic content.

Outputs are excluded by default. `review_outputs` names an explicit host-approved
selection from that same verified snapshot; it never means publish all outputs.
`HumanResponseError(ValueError)` carries a safe code and bounded issues;
`RevisionConflict` remains separate. Do not add a response-validation dry run that
would execute a product validator twice.

### Capability catalogue and proposal schema

Provide a pure factory description API containing only policy-approved and
actually bound agent,
tool, schema and validator aliases; explicitly public descriptions; permitted
step kinds; requested capability shapes; inline/composition permissions; named
model tiers; default-profile behavior; and effective upper limits.

Do not infer public descriptions from private prose. Do not expose runtime
configuration, callback objects, credentials or physical resource bindings.
The application performs tenant-specific projection by constructing the factory
from trusted policy. Catalogue discovery executes no callbacks or probes.

Provide a versioned structural JSON schema for the exact proposal envelope
`{"definition": ..., "inline_agents": ...?}`. It improves authoring but does not
replace graph semantics, reference admission, policy enforcement or sealed
workflow construction. Omitting `model_tier` continues to select the authorized
host default; explicit tiers must be allowed and configured.

Improve admission errors using stable existing codes and bounded safe field
locations, such as `$.definition.steps.review.agent`. Do not expose parser causes,
source text, private registry contents or exception-derived locations. Preserve
the current single-failure behavior initially; an aggregate report can be added
later without making error collection an execution path.

### Input admission and public human interaction

Expose pure native run-input preparation before an application reserves a run.
It snapshots and bounds inputs against the already admitted workflow and returns
the normalized JSON value. It invokes no model, product callback, store or probe.
Harness execution still repeats its own admission and input checks.

Expose a bounded interaction view derived from a validated checkpoint: run
reference, status, committed revision, public question/choices and explicitly
public response-schema metadata. Private inputs, bindings, evidence, outputs and
history are excluded. Structured response errors use stable codes and locations;
invalid input and stale revisions never record a human decision.

The view is a projection, not authentication. The application authorizes access
and selects any output content that a human is permitted to inspect.

Acceptance: policy differences change the public manifest; no forbidden aliases
or private host values appear. Schema/example parity is tested. Input rejection
happens before host reservation. Invalid responses preserve state and revision;
stale responses remain conflicts. Operator `status()` remains available.

## Milestone 3: generated workflows through the integration lab

Add an immutable, owner-scoped proposal path while preserving existing YAML run
clients. Authenticate before reading bodies and keep finite request limits.

| Endpoint | New behavior |
| --- | --- |
| `GET /workflow-catalogue` | Return the caller's policy-projected manifest, schema and host bundle version. |
| `POST /workflow-proposals` | Admit the exact factory envelope without inference, then persist an immutable owned proposal using an idempotency key. |
| `POST /native-runs` | Resolve an owned proposal and retained host bundle; prepare inputs before reserving or dispatching. |
| Existing status/resume/usage routes | Preserve ownership checks and accounting, and support the generic native interaction contract. |

Initially bound proposal bodies at 64 KiB on their route only. Existing 8 KiB run
request limits remain. Policies are host-selected; clients cannot select a bundle,
more privileged registry, endpoint, physical path, tenant or billing identity.
Inline instructions default to denied and are independent of composition grants.

Add application schema v3 with immutable proposal records: owner, idempotency key,
request digest, bounded original envelope, host bundle/policy version and digest,
and admitted workflow fingerprint. Native runs reference a proposal and bundle;
legacy runs keep their original assets identity. Persist no callbacks or secrets.
Migrate transactionally using the migration role; runtime replicas never migrate.

For proposal idempotency, the same owner/key and canonical request body return the
original immutable proposal and bundle reference even after a deployment/policy
upgrade. Do not re-admit that replay under the newest bundle. A different body
under the same owner/key conflicts; start/resume still enforce current revocation.

A retained bundle is trusted host code/content/configuration references plus
versioned policy and callback registrations. Start and resume check current
entitlements/revocation, then rebuild using the frozen historical bundle. Changing
bindings must still reject; a fingerprint alone grants no execution authority.
Do not silently rebuild old runs using the newest policy or callbacks.

Keep the existing reserved/starting/started protocol. An uncertain starting record
never automatically redispatches. Preserve accounting attribution across workers
and resumes, and preserve explicit interrupted-request consent. A missing retained
bundle is an explicit operator condition.

Acceptance requires two tenants, two approved specialists, input provenance,
check/gate, response-schema pause and finish; separate composition/inline grants;
fresh-worker reconstruction; rejected privilege injection with zero callbacks,
inference, reservations or Harness state; owner isolation; invalid/stale responses;
receipt adoption without extra calls; policy revocation; altered/missing bundles;
and old YAML waiting/receipt recovery through an SDK and application upgrade.

Generate those legacy waiting/receipt fixtures using the actual released SDKs in
the immutable Lab 0.2.0 manifest, then upgrade the application schema and SDK
environment. Historical source fixtures alone are insufficient upgrade evidence.

## Milestone 4: consequential tools and fine-grained invocation budgets

### Trusted tool execution context

Add opt-in context-aware custom handlers while retaining existing one-argument
handlers and authorizers unchanged. The host supplies a dedicated operation scope
independent of accounting context. A context includes a stable host-resolved
operation key, tool/version and arguments digest, deadline/cancellation state and
attempt/call references needed by the host's journal.

Models cannot supply or override operation keys, authorization identity or journal
bindings. Host namespaces and resolver versions participate in native binding
identity when enabled. Disabled new fields are omitted from legacy descriptors
and identity inputs to preserve old fingerprints.

The optional journal interface must provide atomic claim and outcome commit,
distinguishing new, completed and uncertain operations. Completed matching
operations may return their recorded bounded result. Existing uncertain claims
block dispatch pending an explicit host resolution. Journal errors are critical;
telemetry cannot substitute for an outcome record.

The journal does not make an external effect and its result recording atomic.
Domain tools must implement transactional/idempotent operations using the trusted
key, or preserve uncertainty for operator resolution. Do not promise universal
exactly-once execution or let interrupted-retry consent automatically resolve a
tool effect. Cancellation after an effect must preserve its uncertainty/evidence.

The public seam is explicit rather than inferred from function arity:

```python
ProsaicRuntime.run(..., observer=None, operation_context=None, tool_journal=None)
CustomTool(..., with_context=False, operation_key=None)
ToolJournal.claim(operation_namespace, operation_key, signature) -> ToolClaim
ToolJournal.commit(operation_namespace, operation_key, claim_token,
                   bounded_outcome) -> None
```

`InvocationScope` contains an opaque invocation ID, optional run/step IDs and
trusted operation namespace. Context-aware handlers and authorizers receive
`(arguments, ToolExecutionContext)`. A registered operation-key resolver declares
journaled execution and requires a journal. Business operation keys are resolved
by trusted host code; provider call IDs, attempt ordinals and argument hashes are
correlation/signature data and never automatically business idempotency keys.

Namespace and key form the journal address; equal keys in different trusted
namespaces are independent. A namespace is required for journaled execution and
is sealed in native binding identity. `CustomTool.version` explicitly versions
the handler, authorizer and key resolver together; changing any of those
semantics requires a version change. Enabled descriptor fields participate in
identity; disabled fields remain omitted exactly as in existing releases.

The claim is `new` (with fencing token), `replay` (with validated bounded outcome)
or `uncertain`. The signature binds tool name/version and canonical argument hash.
Check grant/schema/authorization before claiming or replaying. Journal failure,
signature conflict, uncertainty and a journaled handler exception stop execution
without model-driven retry. Commit the bounded outcome before checking subsequent
cancellation/deadline. Host reconciliation resolves uncertain effects externally.

Commit is an atomic compare-and-set against the current fencing token. Stale
tokens cannot overwrite replayed or reconciled outcomes. Never reclaim an
uncertain claim because a lease or timeout elapsed. Resolution permitting retry
requires authoritative no-effect/quiescent-worker evidence or an operation with
domain idempotency/fencing. Runtime has no automatic reconciliation API.

Post-effect serialization or result-bound failure, and a lost commit
acknowledgement, stop the invocation and preserve uncertainty/recoverable journal
evidence. They must not enter the existing model-retry tool-error path. A later
claim may replay a successfully committed bounded outcome after an acknowledgement
was lost; it may not repeat an uncertain effect.

Implement the demonstrator journal in the lab application database, rather than
mixing business operation state into usage recording or Harness checkpoints.

Acceptance: duplicates and fresh-process retries apply a synthetic effect once;
completed results are bounded and match tool/arguments identity; crashes around
claim/effect/commit preserve uncertainty; concurrent claims dispatch once; changed
arguments/versions fail safely; old tool signatures and descriptors remain stable.

### Invocation budgets

Add optional nonnegative integer `RunPolicy.max_provider_requests`,
`max_tool_calls` and `max_reported_tokens`, with `None` preserving legacy behavior
and zero meaning no allowance. Count all outgoing provider attempts and tool
dispatch attempts, including denied/malformed calls, multi-call batches and
journal replays, at their respective single dispatch boundaries. Acquisition and
follow-up turns share the counters. Prevent further dispatch at exhaustion;
a complete final response exactly at the reported-token cap may succeed.

Define a strict unknown-usage mode when a token cap is enabled; unknown usage
cannot be treated as zero. Usage already incurred is recorded even when a cap
halts further work. These controls bound continued dispatch; they do not promise
a precise prepaid invoice ceiling or hard preemption of arbitrary callbacks.

When a reported-token cap is enabled, unknown usage and over-cap usage on a
terminal response also produce a budget failure, retaining all incurred reported
or partial/unknown usage evidence. The final-response boundary is not an exemption
from strict budget accounting.

Harness passes remaining workflow time and reported-token allowance into Runtime,
and separately configured per-invocation provider/tool caps. Harness `max_calls`
continues to mean workflow invocations and is never reinterpreted as provider
requests. Preserve checkpoint v2, receipt v1 and reported/unknown accounting.

Use optional trusted `WorkflowPolicy.max_provider_requests_per_invocation` and
`max_tool_calls_per_invocation` fields, both nonnegative integers or `None`.
The initial graph proposal does not gain a second ambiguous provider-call unit:
these host caps are described publicly but configured only by the application.
Enabled caps participate in native policy identity; disabled fields are omitted
from existing identity payloads.

Acceptance covers oversized multi-call batches, exact boundaries, initial tools,
reported usage across rounds, unknown/partial usage, cancellation and resumption.
Exhaustion prevents the next dispatch while preserving previous usage/effects.

## Milestone 5: Core authoring and concurrent mutation

### Read-only validation

Add `validate_project(...)` and `prosaic validate --json`, with a versioned
camelCase report containing `valid`, artifact/error/warning counts and structured
issues. Validate canonical frontmatter, bundle references, selected target support
and rendering loss without writing files or executing catalogue manifests.

Check canonical artifacts and bundle references independently of target
selection, including zero targets. Collect rendering-loss issues even when the
project config uses `lossyPolicy: error`; that setting elevates loss issues to
errors while collection continues. No rendering exception erases other issues.

Malformed/classification/schema/reference errors fail validation; rendering-loss
and unsupported-target issues are warnings by default, with configured
`lossyPolicy: error` respected. `--strict` makes remaining warnings fail CI too.
Bound diagnostic fields and exclude raw prose/parser snippets from
the new machine-readable report. Existing `apply` warnings and legacy command
contracts remain unchanged; the new command has its own help and documentation.

Acceptance: valid and broken projects produce stable codes, locations and exit
status; strict mode covers target warnings; validation has zero filesystem writes,
no probes/model calls and no manifest modification; installed-wheel usage works.

### Project mutation ownership

Serialize all non-dry-run Python apply/deploy/revert entry points through a project-scoped
advisory lock acquired before reading shared provenance. Use a persistent reserved
coordination file and OS-backed nonblocking locking, so process death releases
ownership without unsafe stale-lock deletion. POSIX and Windows backends must be
explicitly implemented/tested for the platforms claimed by the release.

The coordination file is `.prosaic-operation.lock` under the canonical resolved
project root. Opening it requires no-follow, regular-file and identity checks.
Reserve this path below every GuardedFs mutation helper, including ordinary
apply writes, atomic replacement, move sources, removals and reconciliation.
Reject operations that replace/delete the coordination inode or an ancestor.
Resolve project/target aliases before comparing reserved paths. Never unlink the
coordination file to release a lock.

Retain ownership through discovery/planning, staging, output mutation, manifest
save and backup cleanup. Dry-run and validation never create the coordination
file or acquire this mutation lock.

Reject unsafe lock paths and attempts to deploy/revert the coordination file.
Keep the file present after release to avoid inode-replacement races. Preserve
existing manifest bytes, output ownership and report counts. Return a specific
busy error rather than allowing overlapping mutations. Dry-run and validation
remain read-only and document that their previews are not transactional snapshots.

Acceptance uses real processes for package/package, package/apply, apply/revert,
owner crash, symlink aliasing and unsafe coordination paths. Unrelated projects
operate concurrently; old differential tests and crash reconciliation pass.
This is cooperative local/filesystem locking, not a distributed deployment lock
for independently mounted or incompatible network filesystems.

## Milestone 6: compatible packages, releases and normal index distribution

The target release train is:

| Distribution | Target | Dependency ownership |
| --- | --- | --- |
| `b3-prosaic` | 0.4.0 | Canonical prose distribution and validation. |
| `b3-prosaic-runtime` | 0.8.0 | `b3-prosaic>=0.4,<0.5`. |
| `b3-prosaic-runtime-postgres` | 0.2.0 | Qualified compatible Runtime range. |
| `b3-prosaic-harness` | 0.7.0 | `b3-prosaic-runtime>=0.8,<0.9`. |
| `b3-prosaic-harness-postgres` | 0.2.0 | Qualified compatible Harness range. |
| Integration lab application | 0.3.0 | Exact released wheel versions, checksums and provenance. |

Normal SDK wheel metadata contains versioned index requirements and no direct Git
URLs. Python module names and CLI entry points are unchanged. Historical release
bytes and receipts retain their original names. Migration uses a fresh virtual
environment/image, since old and renamed distributions share installed paths.
Document the naming distinction prominently; never install PyPI's unrelated
`prosaic` as a dependency or migration shortcut.

Use one `.github/workflows/publish.yml` in each SDK repository and environment
`pypi`. Register five pending/trusted PyPI publishers for `B3Cognition/prosaic`,
`B3Cognition/prosaic-runtime` (two distributions), and
`B3Cognition/prosaic-harness` (two distributions). OIDC publication uses short-lived
credentials; no API token is committed or pasted into documentation. Owner setup
is required if the account is unavailable to the task.

Release builds originate from an exact clean tag/commit archive. Audit source and
wheel entries against tracked allowlists and permitted generated metadata; exclude
untracked research, caches, runs, credentials and local evidence. Run metadata,
source archive, installed-wheel and downstream compatibility gates. Pin publishing
actions to verified immutable revisions and keep write/OIDC permissions scoped to
the required publication jobs.

Publish in dependency order: Core, Runtime and recorder adapter, Harness and store
adapter, then lab. Publish identical qualified bytes to GitHub and the index,
with checksums and machine-readable verification receipts. Existing same-version
bytes are immutable: matching hashes are an idempotent success; different hashes
require a new version. Download and verify the published bytes before updating
the lab release manifest and claiming index installation is available.

Make the lab's active wheel installation manifest-driven, with cache isolation by
manifest digest. Do not glob-install preserved historical wheels alongside renamed
packages. Audit active installed distributions and actual package payloads;
retain old caches/images separately for upgrade and reconstruction tests.

Acceptance includes clean ordinary index installs, no legacy/unrelated Core
distribution, minimum-supported dependency versions, exact release-byte payload
audits, import/CLI compatibility, and all required native architecture/PostgreSQL
cells. Public PyPI readiness is separate from successful GitHub artifact upload.

Milestone 6 prepares the distribution channel and release machinery. Its public
uploads are the final delivery gate after Milestone 7's intended release code and
required synthetic qualification are complete. Do not publish the target version
and then change its bytes to add the final milestone.

## Milestone 7: conformance and operational qualification

The conformance APIs are a pure
`evaluate_conformance(suite, profile_fingerprint, observations)` and an opt-in
`diagnostics.conformance(config, profile, live=False, policy=None, observer=None)`.
`live=False` performs no model discovery, HTTP, inference or CLI/version probes;
it reports untested capabilities explicitly.

The canonical report contains `version=1`, a versioned suite ID, Runtime version,
opaque profile identity and ordered cases. Case states are `passed`, `failed`,
`unsupported`, `unknown` and `not_run`, with fixed machine reason codes. Keep
timestamps, timings and response IDs outside the canonical comparison payload.
Exclude raw prompts, outputs, endpoint URLs, headers and keys. Identical evidence
must yield byte-identical canonical report data. Never promote fixture results
into live-profile qualification.

Extend Runtime diagnostics with a versioned provider/model/profile capability
report: tool-choice behavior, argument validation, constrained JSON behavior,
stream termination, cancellation and usage completeness. Report supported,
unsupported and unknown states separately. Local schema validation remains
mandatory even when provider-side constrained output is requested.

Provide replayable, bounded scenario evaluations with explicit assertions for
workflow progression, tool permission/dispatch, output schemas, human pauses and
usage/effect evidence. Synthetic fixtures are credential-free. Reports record the
tested artifact/provider/configuration identities and do not certify an untested
live model. Live runs require explicit supplied configuration and finite shared
call/time/output allowance.

Extend the lab's existing arrival-rate runner with versioned qualification
profiles for per-tenant fairness/starvation, synthetic provider/tool latency,
sustainable throughput, rejection, approval deferral, read liveness, database
growth and accounting reconciliation. Longer soak remains explicitly bounded by
duration, calls and records. Overload correctness is not a capacity/SLO pass.

Add owned-database recovery exercises measuring RPO/RTO using durable markers,
consistent backup/restore and recovered ownership/revisions/receipts/unknown usage.
Never redispatch during restoration; retention copies are not consistent backups.
Do not delete uncertain operations or introduce idempotency expiry without a
separate reviewed deletion policy.

Provide staging opt-in identity/ingress qualification using approved origins and
private token/CA/configuration references. Verify actual issuer/audience/lifetime,
rotation/outage, backend isolation and drain. Missing deployment/provider inputs
produce `not_qualified` evidence, not substituted fixture success. No existing
shared database, gateway, issuer or paid provider is contacted by default.

Acceptance is deterministic local conformance plus required native synthetic
service qualification. Production-specific capacity, managed identity, HA/PITR
and actual provider certification remain separately reported until those real
deployment lanes are executed.

## Delivery and review boundaries

Each milestone must leave compatible, testable software and record commands,
counts, architectures, versions and remaining external qualification inputs.
Use focused red/green regression tests, full relevant suites, source/wheel checks,
independent reviews and the required platform CI. Preserve unrelated user files
and historical evidence. No paid calls or deployment-resource mutation is implied
by synthetic qualification.

The approved high-level scope is now expressed as this written architecture.
After its review, create separate implementation plans for Runtime, Harness,
Core/packages and the lab so ownership and dependency sequencing remain clear.
