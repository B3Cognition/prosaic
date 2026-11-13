# Prosaic 0.5.1 — catalogue ontology

Core supports the v1 [catalogue ontology attachment](catalogue-ontology.md)
for trusted host metadata about registered agent and tool aliases. Use
`prosaic.ontology.load_ontology(path)` for a host-selected UTF-8 JSON file or
`prosaic.ontology.validate_ontology(document)` for an in-memory JSON object.
Both return a detached dictionary. Invalid inputs raise
`ValueError("Invalid ontology attachment")`.

The stable format retains `schemaVersion: 1` and the camelCase fields used by
0.5.1rc1. Validation enforces bounded sizes, declared concept references and
unique relation triples. Existing projects can upgrade without changing their
CLI commands, canonical Markdown, output contracts or ownership records.

Install `b3-prosaic==0.5.1` on Python 3.11 or later. To expose an attachment
through workflow catalogue discovery, use Harness 0.9.18 with Runtime 0.9.23
and explicitly request the projection. Hosts that use ordinary Harness discovery
can keep Core 0.5.0.

The release gate exercises source, installed wheels and wheels rebuilt from the
source archive on Linux x64 and arm64, plus native Windows validation. These
checks cover metadata and package compatibility using synthetic inputs.
