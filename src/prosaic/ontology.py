"""Read-only, experimental ontology metadata for existing catalogue aliases."""
import json
import os
import re
import stat


_MAX_BYTES = 65_536
_MAX_ENTRIES = 256
_IDENTIFIER = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,63}")
_FIELDS = {"schemaVersion", "ontologyId", "concepts", "relations", "agents", "tools"}
_RELATION_FIELDS = {"source", "predicate", "target"}


def _require(condition):
    if not condition:
        raise ValueError("Invalid ontology attachment")


def _identifier(value):
    return type(value) is str and _IDENTIFIER.fullmatch(value) is not None


def _entries(value):
    return type(value) is dict and len(value) <= _MAX_ENTRIES and all(map(_identifier, value))


def _description(value):
    return (type(value) is str and 0 < len(value) <= 1024 and bool(value.strip())
            and "\0" not in value and len(value.encode("utf-8")) <= 1024)


def validate_ontology(document):
    """Validate a v1 attachment and return a detached JSON document."""
    _require(type(document) is dict and document.keys() == _FIELDS)
    _require(type(document["schemaVersion"]) is int and document["schemaVersion"] == 1
             and _identifier(document["ontologyId"]))
    concepts = document["concepts"]
    try:
        _require(_entries(concepts) and all(map(_description, concepts.values())))
    except UnicodeError:
        raise ValueError("Invalid ontology attachment") from None
    for category in ("agents", "tools"):
        annotations = document[category]
        _require(_entries(annotations))
        for references in annotations.values():
            _require(type(references) is list and 0 < len(references) <= _MAX_ENTRIES
                     and all(_identifier(ref) and ref in concepts for ref in references)
                     and len(set(references)) == len(references))
    relations = document["relations"]
    _require(type(relations) is list and len(relations) <= 512)
    seen = set()
    for relation in relations:
        _require(type(relation) is dict and relation.keys() == _RELATION_FIELDS
                 and all(map(_identifier, relation.values())))
        edge = (relation["source"], relation["predicate"], relation["target"])
        _require(edge[0] in concepts and edge[2] in concepts and edge not in seen)
        seen.add(edge)
    snapshot = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    _require(len(snapshot) <= _MAX_BYTES)
    return json.loads(snapshot)


def _unique_object(pairs):
    result = dict(pairs)
    _require(len(result) == len(pairs))
    return result


def load_ontology(path):
    """Read and validate a bounded UTF-8 JSON file supplied by the host."""
    try:
        _require(stat.S_ISREG(os.lstat(path).st_mode))
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        with os.fdopen(os.open(path, flags), "rb") as stream:
            _require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode))
            raw = stream.read(_MAX_BYTES + 1)
        _require(len(raw) <= _MAX_BYTES)
        return validate_ontology(json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object))
    except (OSError, ValueError, RecursionError):
        raise ValueError("Invalid ontology attachment") from None
