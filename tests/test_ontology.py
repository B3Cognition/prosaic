import json
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
    path.symlink_to(FIXTURE)
    with pytest.raises(ValueError, match="Invalid ontology attachment"):
        load_ontology(path)
