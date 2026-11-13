# Catalogue ontology

An ontology attachment is optional public metadata supplied by the host.
It describes concepts, their relationships, and the aliases that use them.
The existing catalogue and workflow bindings remain authoritative for agent
definitions, tool registrations, and grants.

The UTF-8 JSON document has six required fields.

| Field | Format |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `ontologyId` | Attachment identifier |
| `concepts` | Map from concept identifiers to public descriptions |
| `relations` | List of unique objects with `source`, `predicate`, and `target`. Both endpoints must exist in `concepts`. |
| `agents` | Map from existing agent aliases to nonempty lists of distinct concept identifiers |
| `tools` | Map from existing tool aliases to nonempty lists of distinct concept identifiers |

Identifiers start with an ASCII letter and contain up to 64 ASCII letters,
digits, underscores, or hyphens. Descriptions are nonblank, contain no NUL
characters, and contain up to 1,024 UTF-8 bytes.
The file and compact document are each limited to 64 KiB. Each map accepts up
to 256 entries, and `relations` accepts up to 512 entries. Duplicate JSON keys,
unknown fields, and unknown concept references fail validation. The loader
accepts a host-selected regular file and rejects symlinks at the file itself.
`prosaic.ontology.validate_ontology(document)` accepts a Python JSON object.
Both APIs return a detached dictionary. Invalid input raises
`ValueError("Invalid ontology attachment")`.

Pass the result of `prosaic.ontology.load_ontology(path)` to Harness as
`WorkflowCatalog(ontology=attachment, ...)`. Discover the policy-scoped
attachment through `WorkflowFactory.describe(include_ontology=True)`. The
[attachment and expected projection](../conformance-fixtures/catalogue-ontology)
are shared by the installed-wheel check in Integration Lab.
