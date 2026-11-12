"""Validate read-only v1 ontology metadata for existing catalogue aliases."""
import json
import os
import re
import stat
from itertools import islice


_MAX_BYTES = 65_536
_MAX_ENTRIES = 256
_MAX_RELATIONS = 512
_ERROR = "Invalid ontology attachment"
_IDENTIFIER = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,63}")
_FIELDS = {"schemaVersion", "ontologyId", "concepts", "relations", "agents", "tools"}
_RELATION_FIELDS = {"source", "predicate", "target"}


def _require(condition):
    if not condition:
        raise ValueError(_ERROR)


def _identifier(value):
    return type(value) is str and _IDENTIFIER.fullmatch(value) is not None


def _object(value, limit):
    _require(type(value) is dict and len(value) <= limit)
    snapshot = dict(islice(value.items(), limit + 1))
    _require(len(snapshot) <= limit and all(map(_identifier, snapshot)))
    return snapshot


def _list(value, limit):
    _require(type(value) is list and len(value) <= limit)
    snapshot = value[:limit + 1]
    _require(len(snapshot) <= limit)
    return snapshot


def _description(value):
    return (type(value) is str and 0 < len(value) <= 1024 and bool(value.strip())
            and "\0" not in value and len(value.encode("utf-8")) <= 1024)


def validate_ontology(document):
    """Validate a v1 attachment and return a detached JSON document."""
    try:
        snapshot = _object(document, len(_FIELDS))
        _require(snapshot.keys() == _FIELDS)
        _require(type(snapshot["schemaVersion"]) is int and snapshot["schemaVersion"] == 1
                 and _identifier(snapshot["ontologyId"]))
        concepts = _object(snapshot["concepts"], _MAX_ENTRIES)
        _require(all(map(_description, concepts.values())))
        snapshot["concepts"] = concepts
        for category in ("agents", "tools"):
            annotations = _object(snapshot[category], _MAX_ENTRIES)
            for alias, value in annotations.items():
                references = _list(value, _MAX_ENTRIES)
                _require(references and all(_identifier(ref) and ref in concepts for ref in references)
                         and len(set(references)) == len(references))
                annotations[alias] = references
            snapshot[category] = annotations
        relations = _list(snapshot["relations"], _MAX_RELATIONS)
        seen = set()
        for index, value in enumerate(relations):
            relation = _object(value, len(_RELATION_FIELDS))
            _require(relation.keys() == _RELATION_FIELDS and all(map(_identifier, relation.values())))
            edge = (relation["source"], relation["predicate"], relation["target"])
            _require(edge[0] in concepts and edge[2] in concepts and edge not in seen)
            seen.add(edge)
            relations[index] = relation
        snapshot["relations"] = relations
        encoder = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"))
        size = 0
        for chunk in encoder.iterencode(snapshot):
            size += len(chunk.encode("utf-8"))
            _require(size <= _MAX_BYTES)
        return snapshot
    except (UnicodeError, RuntimeError):
        raise ValueError(_ERROR) from None


def _unique_object(pairs):
    result = dict(pairs)
    _require(len(result) == len(pairs))
    return result


def load_ontology(path):
    """Read and validate bounded UTF-8 JSON from a host-selected regular file."""
    try:
        path = os.fspath(path)
        before = os.lstat(path)
        _require(stat.S_ISREG(before.st_mode))
        flags = (os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
                 | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0))
        descriptor = os.open(path, flags)
        try:
            opened = os.fstat(descriptor)
            after = os.lstat(path)
            _require(stat.S_ISREG(opened.st_mode) and stat.S_ISREG(after.st_mode)
                     and os.path.samestat(before, opened) and os.path.samestat(opened, after))
            with open(descriptor, "rb", closefd=False) as stream:
                raw = stream.read(_MAX_BYTES + 1)
        finally:
            os.close(descriptor)
        _require(len(raw) <= _MAX_BYTES)
        return validate_ontology(json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object))
    except (OSError, TypeError, ValueError, RecursionError):
        raise ValueError(_ERROR) from None
