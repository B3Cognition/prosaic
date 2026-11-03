# Enforcement tags

A canonical Markdown body can declare which of its rules a host may check
mechanically. Core treats these declarations as inert data: it parses,
validates, reports and strips them. It never registers, looks up or executes a
guard, and a tag never changes what an agent may do.

```markdown
- Never print a borrower's contact details. <!-- enforce: no_contact_details(stage=before_answer, on_violation=fail) -->
- Keep each catalogue entry within the house line limit.
<!-- enforce: max_lines(limit=12, stage=after_tool) --> <!-- enforce: entry_format(fields=[title, author, "shelf mark"]) -->
- Be warm and patient with volunteers.
<!-- prose-only: tone is judged by people, not checks -->
```

## Grammar

```text
<!-- enforce: NAME(key=value, key=[value, value], stage=STAGE, on_violation=ACTION) -->
<!-- prose-only: REASON -->
```

- `NAME` and every key match `[a-z][a-z0-9_]*`. Parentheses are required;
  `NAME()` takes no settings.
- A value is an identifier (`[A-Za-z_][A-Za-z0-9_]*`, kept as a string, so
  `true` is `"true"`), an integer (`-3`, `12`), a double-quoted string (`\"` and
  `\\` are the only escapes) or a flat list of those. Lists do not nest. A key
  may appear once per tag; a trailing comma is malformed.
- `STAGE` is one of `before_tool`, `after_tool`, `before_answer` or `final`
  (default `final`). `ACTION` is one of `fix`, `retry` or `fail` (default
  `retry`). Both take bare identifiers.
- `REASON` is any non-empty text.
- The keywords are lowercase and a tag fits on one line. Several tags may share
  a line. Values are read by a small tokenizer; nothing is evaluated.

A tag binds to the **rule sentence** on its own line, or, when the tag line holds
only tags, to the line directly before it. A rule sentence is any non-blank,
non-heading, non-code line: a list item or a plain paragraph line. Its `text` is
that line with tags, list markers and block-quote markers removed.

Tags inside fenced or indented code blocks and inline code spans on one line
are examples: they are not parsed, reported or stripped. Other HTML comments,
including `<!-- enforcement notes -->` and `<!-- Enforce: ... -->`, are ordinary
prose. Only the primary body is read; bundle resources are not.

## Inspection

`inspect_artifact` (and `prosaic inspect`) adds two keys when a body contains at
least one tag outside code:

- `rules`: one entry per accepted tag, ordered by line, then column.
- `ruleIssues`: the problems described under Validation, in the same order.

```json
{"id": "subagents/shelf-keeper.md:14:max_lines", "kind": "enforce",
 "guard": "max_lines", "stage": "after_tool", "action": "retry",
 "settings": {"limit": 12}, "reason": null,
 "source": {"file": "subagents/shelf-keeper.md", "line": 14},
 "text": "Keep each catalogue entry within the house line limit."}
```

`id` is `file:line:guard`, or `file:line:prose-only` for a `prose_only` entry
(whose `guard`, `stage` and `action` are `null`, `settings` is `{}` and `reason`
is the text). `file` is the artifact id and `line` is the tag's 1-based line in
the source file, counting frontmatter. Every key is always present in an entry.
`settings` keeps the author's keys and order. `body` is returned as written,
tags included.

**No tag, no behaviour, including output.** An untagged body adds neither key,
so its inspection is byte-identical to earlier releases. This is deliberately
the one exception to the always-present key convention: inspection output is
pinned to the frozen v0.2.0 differential oracle and its shipped CLI suite.

## Distribution

`apply` strips all tags from the body before rendering it for any target,
including malformed and unbound tags. A tag is removed with the
spaces or tabs before it, and a line left blank is removed with its line ending.
A source with tags and the same source without them therefore distribute
byte-identical files; the committed fixtures under
`conformance-fixtures/enforcement-tags/` pin this for every built-in target.
`resolve` reports no body and is unaffected. Apply does not reject invalid tags;
run validation for that. `package deploy` copies canonical source verbatim, tags
included, because its destination is source for another project, not target
output. Imported foreign files are not interpreted; a foreign file containing
tags does not round-trip byte-for-byte.

## Validation

`validate_project` reports tag problems as canonical errors, independent of
selected targets, at location `$.body`:

| Code | Raised for |
| --- | --- |
| `enforce-malformed` | A tag that does not match the grammar, including an unterminated one. |
| `enforce-unknown-stage` | A `stage` outside the accepted stages. |
| `enforce-unknown-action` | An `on_violation` outside the accepted actions. |
| `enforce-duplicate-guard` | The same guard bound twice in one file, or a rule given two `prose-only` tags or both `prose-only` and `enforce`. |
| `enforce-no-rule` | A tag with no rule sentence: on a heading line, an empty list item, or a tag-only line at the start of the body or after a blank line, heading, code block or another tag-only line. |

Messages name `file:line` and the accepted values, for example
`subagents/tide-watcher.md:5: unknown stage; accepted: before_tool, after_tool,
before_answer, final`. They never echo the rejected value or the rule's prose.
Like every validation message, they are bounded to 256 characters, so a very
long artifact path can truncate the end of the accepted-values list; `inspect`
reports the same messages untruncated in `ruleIssues`.

Core does not validate setting keys. It cannot know which keys a guard accepts
without looking the guard up, which would make tags active. Key validation is
the job of the host that registers the guard, such as Prosaic Runtime.

`validate_artifact_definition(kind, frontmatter, body=..., source_path=...)`
also validates tags in a supplied body and returns the first problem as
`{'ok': False, 'field': 'body', 'reason': ...}`. Without a file, lines count
from the start of the body and `source_path` defaults to `body`.

## Public API

Hosts and Runtime use the same functions core uses, so stripping and parsing
cannot drift between them:

```python
from prosaic import inspect_artifact, parse_rules, strip_tags

data = inspect_artifact(root, 'subagents/shelf-keeper.md')['data']
prompt = strip_tags(data['body'])
parsed = parse_rules(data['body'], data['id'])
```

- `strip_tags(body)` returns the body exactly as every target receives it: each
  tag, well-formed or not, is removed with the spaces or tabs before it, a line
  left blank is removed with its line ending, and tags in code are kept. A body
  without tags is returned unchanged, as the same object.
- `parse_rules(body, file, line_offset=0)` returns `{'rules': [...], 'issues':
  [...]}` with the entry and issue shapes above, in line, then column, order.
  `file` names the source in ids and messages. `line_offset` is the number of
  source lines before the body, such as frontmatter; with the default, lines
  count from the body. Both lists are empty when the body has no tag outside
  code. Unlike `validate_project`, issue messages are not truncated.

Neither function reads files, looks up or executes a guard, or evaluates a
value. Prefer `rules` from `inspect_artifact`, which already counts frontmatter
lines; call `parse_rules` for a body that has no file.

## Declarations are not grants

A tag can never widen what an agent may do. It declares a check that a host may
enforce; it does not grant tools, files, network access or budget, and it does
not install or trust anything. A host that ignores tags loses only those checks.
A tag's declared `stage`, `on_violation` or `prose-only` is advisory against host
policy and can never weaken a guard the host requires.
Permissions remain the operator's Runtime and Harness configuration; see
[the README](../README.md#declarations-are-not-permission-grants).

## How a Runtime consumes `rules`

A Runtime reads `rules` from inspection, never the raw comments:

1. Register guards in host code or configuration. Validate each guard's
   `settings` keys and values at registration or admission time.
2. For each `enforce` entry, look up `guard` in the host registry. An unknown
   guard is a host decision (refuse admission, or warn and skip); core has no
   opinion and never resolves it.
3. Run the guard at `stage` and, on a violation, apply `action`: `fix` lets the
   host repair the output, `retry` asks the model again, `fail` stops the step.
   After an `on_violation=fix` repair, the host re-runs every rule before
   treating the output as passing; a repair is not success on its own.
4. Treat `prose_only` entries as documentation: the author states that the rule
   is intentionally left to the model, with `reason` explaining why.
5. Send the model `strip_tags(body)`, the same text distribution writes.
6. Rule ids include the source line, so a workflow identity should hash each
   entry's binding fields (`guard`, `stage`, `action`, `settings` and
   `source.file`) rather than its `id`; edits above a rule then leave the
   identity unchanged, while any change to a binding changes it.

## Design rules

1. **No tag, no behaviour.** An untagged body parses, validates, inspects and
   distributes exactly as before.
2. **Guards are registered by the host, never discovered from Markdown.** A
   guard name in prose is a reference, not code, configuration or a grant.
3. **No new dependencies.** The parser uses the standard library and the
   existing CommonMark parser to recognise code and headings.
