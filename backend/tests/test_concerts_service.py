from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import pytest

from app.services.concerts import ConcertsService, ConcertsServiceError
from app.services.catalog_enrichment import CatalogEnrichmentError


class StubConcertsService(ConcertsService):
    def __init__(self, project_root: Path):
        super().__init__(project_root)
        self.commands: list[tuple[str, tuple[str, ...]]] = []

    def _run_node_script(self, relative_script_path: str, *args: str) -> None:
        self.commands.append((relative_script_path, args))


class FailingEnricher:
    def __init__(self) -> None:
        self.calls = 0

    def enrich(self, _catalog: dict) -> dict:
        self.calls += 1
        raise CatalogEnrichmentError("quota unavailable")


class FlakyRefreshService(StubConcertsService):
    def __init__(self, project_root: Path):
        super().__init__(project_root)
        self.export_failures = 1

    def _run_node_script(self, relative_script_path: str, *args: str) -> None:
        self.commands.append((relative_script_path, args))
        if relative_script_path == "scripts/export-concerts-notes.mjs" and self.export_failures:
            self.export_failures -= 1
            raise ConcertsServiceError("Apple Notes was temporarily unavailable")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_refresh_catalog_runs_export_then_build(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    write_json(tmp_path / "data/notes/concerts.catalog.json", {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}})

    catalog = service.refresh_catalog()

    assert service.commands == [
        ("scripts/export-concerts-notes.mjs", ()),
        ("scripts/build-concerts-catalog.mjs", ()),
    ]
    assert catalog["schemaVersion"] == 2


def test_refresh_catalog_retries_transient_notes_failure(tmp_path: Path, monkeypatch) -> None:
    service = FlakyRefreshService(tmp_path)
    monkeypatch.setattr("app.services.concerts.time.sleep", lambda _seconds: None)
    write_json(tmp_path / "data/notes/concerts.catalog.json", {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}})

    result = service.refresh_catalog()

    assert result["schemaVersion"] == 2
    assert service.commands[:3] == [
        ("scripts/export-concerts-notes.mjs", ()),
        ("scripts/export-concerts-notes.mjs", ()),
        ("scripts/build-concerts-catalog.mjs", ()),
    ]


def test_append_line_runs_mutation_then_refresh(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    write_json(tmp_path / "data/notes/concerts.catalog.json", {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}})

    service.append_line("NEW LINE")

    assert service.commands[0] == ("scripts/append-concerts-note.mjs", ("NEW LINE",))
    assert service.commands[1:] == [
        ("scripts/export-concerts-notes.mjs", ()),
        ("scripts/build-concerts-catalog.mjs", ()),
    ]


def test_create_and_update_entry_run_scoped_mutations_then_refresh(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    write_json(tmp_path / "data/notes/concerts.catalog.json", {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}})

    service.create_entry("wantToSee", "New Artist", "2026-01-01T00:00:00Z")
    create_payload = json.loads(service.commands[0][1][0])
    assert create_payload == {
        "action": "create",
        "section": "wantToSee",
        "raw": "New Artist",
        "expectedModifiedAt": "2026-01-01T00:00:00Z",
    }

    service.commands.clear()
    service.update_entry("wantToSee", "New Artist", "New Artist - good seats", "2026-01-01T00:00:00Z")
    update_payload = json.loads(service.commands[0][1][0])
    assert update_payload["action"] == "update"
    assert update_payload["originalRaw"] == "New Artist"
    assert service.commands[1:] == [
        ("scripts/export-concerts-notes.mjs", ()),
        ("scripts/build-concerts-catalog.mjs", ()),
    ]


def test_refresh_ensures_media_for_catalog_artists(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    write_json(tmp_path / "data/notes/concerts.catalog.json", {
        "schemaVersion": 2,
        "source": {},
        "rawExport": {},
        "parsedCatalog": {
            "wantToSee": [{"artist": "New Artist"}],
            "haveSeen": [{"artist": "Known Artist"}],
            "futureConcerts": [],
        },
    })

    service.refresh_catalog()

    media_command = service.commands[-1]
    assert media_command[0] == "scripts/ensure-concert-artist-media.mjs"
    assert json.loads(media_command[1][0]) == ["New Artist", "Known Artist"]


def test_refresh_returns_deterministic_catalog_when_enrichment_fails(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    service.enricher = FailingEnricher()
    base = {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}}
    write_json(tmp_path / "data/notes/concerts.catalog.json", base)

    with pytest.warns(RuntimeWarning, match="quota unavailable"):
        result = service.refresh_catalog()

    assert result == base


def test_note_mutation_never_calls_openai_enrichment(tmp_path: Path) -> None:
    service = StubConcertsService(tmp_path)
    enricher = FailingEnricher()
    service.enricher = enricher
    base = {"schemaVersion": 2, "source": {}, "rawExport": {}, "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []}}
    write_json(tmp_path / "data/notes/concerts.catalog.json", base)

    result = service.create_entry("wantToSee", "New Artist", "2026-01-01T00:00:00Z")

    assert result == base
    assert enricher.calls == 0


def test_set_artist_image_appends_and_replaces_manual_override(tmp_path: Path) -> None:
    service = ConcertsService(tmp_path)
    write_json(service.media_manifest_path, {
        "schemaVersion": 2,
        "artists": [{"key": "existing", "names": ["New Artist"], "imageUrl": "https://example.com/old.jpg"}],
        "venues": [],
    })

    service.set_artist_image("New Artist", "https://example.com/custom.jpg")
    result = service.set_artist_image("New Artist", "https://example.com/replacement.jpg")

    manual = [record for record in result["artists"] if record.get("rightsClass") == "user-provided"]
    assert len(manual) == 1
    assert manual[0]["imageUrl"] == "https://example.com/replacement.jpg"
    assert result["artists"][0]["imageUrl"] == "https://example.com/old.jpg"


def test_save_and_browse_concert_uploads(tmp_path: Path) -> None:
    service = ConcertsService(tmp_path)

    uploaded = service.save_upload(
        "Post Malone",
        "2018-06-08",
        "memory.jpg",
        "image/jpeg",
        BytesIO(b"photo-data"),
    )
    listed = service.list_uploads(artist="post malone", date="2018-06-08")
    metadata, path = service.get_upload_file(uploaded["id"])

    assert listed["items"] == [uploaded]
    assert metadata == uploaded
    assert path.read_bytes() == b"photo-data"
    assert path.suffix == ".jpg"


def test_save_upload_rejects_unsupported_media(tmp_path: Path) -> None:
    service = ConcertsService(tmp_path)

    with pytest.raises(ConcertsServiceError, match="Use a JPEG"):
        service.save_upload("Artist", "2026-01-01", "notes.txt", "text/plain", BytesIO(b"nope"))


def test_delete_upload_removes_metadata_and_file(tmp_path: Path) -> None:
    service = ConcertsService(tmp_path)
    uploaded = service.save_upload("Post Malone", "2018-06-08", "memory.jpg", "image/jpeg", BytesIO(b"photo-data"))

    result = service.delete_upload(uploaded["id"])

    assert result == {"deleted": uploaded["id"]}
    assert service.list_uploads()["items"] == []
    assert list(service.upload_root.glob(f"{uploaded['id']}.*")) == []


def test_get_catalog_rejects_enriched_output_with_a_stale_source_hash(tmp_path: Path) -> None:
    service = ConcertsService(tmp_path)
    base = {
        "schemaVersion": 2,
        "source": {"modifiedAt": "2026-01-01T00:00:00Z"},
        "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []},
    }
    stale = {
        **base,
        "parsedCatalog": {"wantToSee": [{"artist": "Stale"}], "haveSeen": [], "futureConcerts": []},
        "enrichment": {"sourceHash": "not-the-current-hash"},
    }
    write_json(service.base_catalog_path, base)
    write_json(service.enriched_catalog_path, stale)

    assert service.get_catalog() == base
