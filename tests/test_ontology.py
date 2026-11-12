import json
import os
from pathlib import Path

import pytest


FIXTURE = Path(__file__).resolve().parents[1] / "conformance-fixtures/catalogue-ontology/attachment.json"


def test_attachment_loads_without_modification_and_validation_owns_the_result():
    from prosaic.ontology import load_ontology, validate_ontology

    source = FIXTURE.read_bytes()
    original = json.loads(source)
    assert load_ontology(FIXTURE) == original
    validated = validate_ontology(original)
    original["agents"]["reviewer"].clear()
    assert validated["agents"]["reviewer"] == ["candidate"]
    assert FIXTURE.read_bytes() == source


@pytest.mark.parametrize("mutation", [
    lambda value: value.update(schemaVersion=True),
    lambda value: value.update(grants={"read_receipt": True}),
    lambda value: value["agents"].update(reviewer=["receipt", "receipt"]),
    lambda value: value["tools"].update(read_receipt=["unknown"]),
    lambda value: value["relations"][0].update(target="unknown"),
    lambda value: value["relations"].append(value["relations"][0]),
    lambda value: value["concepts"].update(receipt="é" * 513),
])
def test_attachment_rejects_malformed_metadata(mutation):
    from prosaic.ontology import validate_ontology

    document = json.loads(FIXTURE.read_bytes())
    mutation(document)
    with pytest.raises(ValueError, match="Invalid ontology attachment"):
        validate_ontology(document)


def test_loader_rejects_duplicate_keys_oversize_and_symlinks(tmp_path):
    from prosaic.ontology import load_ontology

    path = tmp_path / "ontology.json"
    for payload in (FIXTURE.read_bytes().replace(b'"schemaVersion": 1', b'"schemaVersion": 1, "schemaVersion": 1'),
                    FIXTURE.read_bytes() + b" " * 65536, b"\xff"):
        path.write_bytes(payload)
        with pytest.raises(ValueError, match="Invalid ontology attachment"):
            load_ontology(path)
    path.unlink()
    try:
        path.symlink_to(FIXTURE)
    except OSError:
        if os.name != "nt":
            raise
        # Windows CI does not always grant the symlink creation privilege.
        return
    with pytest.raises(ValueError, match="Invalid ontology attachment"):
        load_ontology(path)


def test_loader_rejects_replaced_regular_leaf(tmp_path, monkeypatch):
    from prosaic import ontology

    path = tmp_path / "ontology.json"
    replacement = tmp_path / "replacement.json"
    path.write_bytes(FIXTURE.read_bytes())
    replacement.write_bytes(FIXTURE.read_bytes())
    real_open = os.open

    def replace_then_open(filename, flags):
        replacement.replace(path)
        return real_open(filename, flags)

    monkeypatch.setattr(ontology.os, "open", replace_then_open)
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        ontology.load_ontology(path)


def test_raw_and_compact_limits_are_independent(tmp_path):
    from prosaic.ontology import load_ontology, validate_ontology

    payload = FIXTURE.read_bytes()
    path = tmp_path / "ontology.json"
    path.write_bytes(payload.ljust(65_536))
    assert load_ontology(path) == json.loads(payload)
    path.write_bytes(payload.ljust(65_537))
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        load_ontology(path)

    document = {"schemaVersion": 1, "ontologyId": "fixture", "concepts": {},
                "relations": [], "agents": {}, "tools": {}}
    concepts = document["concepts"]
    concepts.update({f"concept{i}": "é" * 505 for i in range(63)})
    concepts["boundary"] = "a"
    compact_size = len(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode())
    concepts["boundary"] += "a" * (65_536 - compact_size)
    assert len(concepts["boundary"]) <= 1024
    assert validate_ontology(document) == document
    concepts["boundary"] += "a"
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        validate_ontology(document)


def test_validated_values_are_owned_before_serialization(monkeypatch):
    from prosaic import ontology

    document = json.loads(FIXTURE.read_bytes())
    expected = json.loads(FIXTURE.read_bytes())
    original_encoder = json.JSONEncoder.iterencode

    def mutate_source(encoder, value, *args, **kwargs):
        document["relations"][0]["target"] = "changed-after-validation"
        return original_encoder(encoder, value, *args, **kwargs)

    monkeypatch.setattr(json.JSONEncoder, "iterencode", mutate_source)
    result = ontology.validate_ontology(document)
    assert result == expected
    assert document["relations"][0]["target"] == "changed-after-validation"
    result["agents"]["reviewer"].clear()
    assert document["agents"]["reviewer"] == ["candidate"]


def test_rejects_nonstring_keys_without_using_them():
    from prosaic.ontology import validate_ontology

    class Key:
        def __hash__(self):
            if self.inserted:
                raise AssertionError("invalid key was hashed during validation")
            return 1

    key = Key()
    key.inserted = False
    document = json.loads(FIXTURE.read_bytes())
    document["concepts"] = {key: "Invalid key."}
    key.inserted = True
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        validate_ontology(document)


def test_cardinality_and_unicode_boundaries():
    from prosaic.ontology import validate_ontology

    concepts = {f"concept{i}": "Public." for i in range(256)}
    concepts["concept0"] = "é" * 511 + "\n" + "a"
    document = {"schemaVersion": 1, "ontologyId": "fixture", "concepts": concepts,
                "relations": [{"source": "concept0", "predicate": f"relation{i}", "target": "concept1"}
                              for i in range(512)],
                "agents": {"agent": list(concepts)}, "tools": {}}
    assert validate_ontology(document) == document
    concepts["extra"] = "Too many concepts."
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        validate_ontology(document)
    del concepts["extra"]
    document["relations"].append({"source": "concept0", "predicate": "extra", "target": "concept1"})
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        validate_ontology(document)


@pytest.mark.parametrize("payload", [
    b'{"x":{"repeated":1,"repeated":2}}',
    b"[" * 1500 + b"]" * 1500,
    b'{"schemaVersion":2}',
    b"{",
], ids=["duplicate-nested", "deep", "unknown-version", "malformed"])
def test_malformed_files_have_a_sanitized_error(tmp_path, payload):
    from prosaic.ontology import load_ontology

    path = tmp_path / "private-file-name"
    path.write_bytes(payload)
    with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
        load_ontology(path)


def test_load_ontology_refuses_nonregular_paths(tmp_path):
    from prosaic.ontology import load_ontology

    paths = [tmp_path, tmp_path / "missing", None]
    if hasattr(os, "mkfifo"):
        fifo = tmp_path / "fifo"
        os.mkfifo(fifo)
        paths.append(fifo)
    for path in paths:
        with pytest.raises(ValueError, match="^Invalid ontology attachment$"):
            load_ontology(path)
