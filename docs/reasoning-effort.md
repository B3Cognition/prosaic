# Reasoning effort in canonical Markdown

Write behavioral instructions in the agent body and execution effort in YAML:

```markdown
---
name: reviewer
description: Review supplied evidence
effort: high
tools: []
---
ALWAYS check the supplied evidence before reaching a conclusion.
NEVER invent missing evidence or claim certainty beyond the inputs.
```

Core preserves and inspects the canonical metadata. Its permissive string
validation does not certify that a provider supports a particular effort.
Runtime owns execution admission and provider-specific controls; Harness owns
workflow state and validation. Model IDs and credentials belong in operator
configuration, not agent Markdown.

Runtime 0.9.12 supports neutral `none`, `low`, `medium`, `high`, `xhigh`, `max`
and Codex-only `ultra` where the selected provider/model supports them. Native
Claude/Codex profiles consume the inspected prose directly. They do not require
writing `.claude`, `.codex` or other vendor directories with `prosaic apply`.
Use `apply` only when you actually want file distribution to those tools.

Natural-language requests to think carefully and native effort settings serve
different purposes. Neither guarantees an answer's correctness or a fixed token
budget. Gemma's positive effort values map to one binary thinking switch;
`none` is its explicit off request. Higher tiers are not inferred for unknown
model aliases. Omitted effort retains the operator profile's default.

The [Runtime effort contract](https://github.com/B3Cognition/prosaic-runtime/blob/main/docs/native-execution.md#reasoning-effort-from-prose)
defines model detection, precedence and supported controls. The
[Integration Lab reasoning guide](https://github.com/B3Cognition/prosaic-integration-lab/blob/main/docs/reasoning-effort.md)
provides copyable agents, API/native configurations, a workflow and credential-free
transport checks. Synthetic fixtures and historical live evidence are labeled
separately; a successful HTTP response does not prove a server honored effort.
