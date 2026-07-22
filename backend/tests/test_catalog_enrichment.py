from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from app.services.catalog_enrichment import (
    CatalogEnricher,
    SanitizedConcertEntry,
)


class FakeSanitizer:
    model = "fake-model"

    def __init__(self) -> None:
        self.calls: List[List[Dict[str, Any]]] = []

    def sanitize(self, entries: List[Dict[str, Any]]) -> List[SanitizedConcertEntry]:
        self.calls.append(entries)
        return [
            SanitizedConcertEntry(
                key=entry["key"],
                artist="Red Hot Chili Peppers" if entry["artist"] == "RHCP" else entry["artist"].title(),
                notes=entry["notes"],
                date_text=entry["date_text"],
                location_text=entry["location_text"],
                confidence=0.98,
                needs_review=False,
                changes=["Canonicalized artist name"],
            )
            for entry in entries
        ]


def catalog_with(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "schemaVersion": 2,
        "source": {
            "noteId": "note-1",
            "title": "Concerts",
            "account": "iCloud",
            "folder": "Notes",
            "createdAt": "2022-01-01T00:00:00Z",
            "modifiedAt": "2026-01-01T00:00:00Z",
            "exportedAt": "2026-01-01T00:00:00Z",
        },
        "rawExport": {"bodyHtml": "<div>Concerts</div>", "bodyText": "Concerts"},
        "parsedCatalog": {"wantToSee": [], "haveSeen": entries, "futureConcerts": []},
    }


def entry(raw: str, artist: str, index: int = 0) -> Dict[str, Any]:
    return {
        "index": index,
        "raw": raw,
        "artist": artist,
        "status": "seen",
        "rating": "love",
        "notes": None,
        "dateText": None,
        "locationText": None,
        "parsed": {"date": None, "venue": None, "city": None},
    }


def test_from_env_loads_backend_dotenv(tmp_path: Path, monkeypatch) -> None:
    backend_path = tmp_path / "backend"
    backend_path.mkdir()
    (backend_path / ".env").write_text(
        "OPENAI_API_KEY=test-key\nOPENAI_MODEL=test-model\nOPENAI_ENRICHMENT_ENABLED=true\n",
        encoding="utf-8",
    )
    for name in ("OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_ENRICHMENT_ENABLED"):
        monkeypatch.delenv(name, raising=False)

    enricher = CatalogEnricher.from_env(tmp_path)

    assert enricher.enabled is True
    assert enricher.model == "test-model"
    assert enricher.sanitizer is not None


def test_first_enrichment_reviews_entries_and_writes_cleaned_catalog(tmp_path: Path) -> None:
    sanitizer = FakeSanitizer()
    enricher = CatalogEnricher(tmp_path, sanitizer=sanitizer, model=sanitizer.model)

    enriched = enricher.enrich(catalog_with([entry("RHCP ❤️", "RHCP")]))

    assert len(sanitizer.calls) == 1
    assert len(sanitizer.calls[0]) == 1
    cleaned = enriched["parsedCatalog"]["haveSeen"][0]
    assert cleaned["artist"] == "Red Hot Chili Peppers"
    assert cleaned["artistKey"] == "red-hot-chili-peppers"
    assert cleaned["raw"] == "RHCP ❤️"
    assert cleaned["rating"] == "love"
    assert enriched["enrichment"]["llmReviewedEntries"] == 1
    assert enricher.cache_path.exists()
    assert enricher.output_path.exists()


def test_unchanged_catalog_uses_cache_without_another_model_call(tmp_path: Path) -> None:
    sanitizer = FakeSanitizer()
    enricher = CatalogEnricher(tmp_path, sanitizer=sanitizer, model=sanitizer.model)
    catalog = catalog_with([entry("RHCP ❤️", "RHCP")])

    enricher.enrich(catalog)
    second = enricher.enrich(catalog)

    assert len(sanitizer.calls) == 1
    assert second["enrichment"]["llmReviewedEntries"] == 0
    assert second["enrichment"]["cacheHits"] == 1


def test_only_new_entry_is_sent_when_catalog_changes(tmp_path: Path) -> None:
    sanitizer = FakeSanitizer()
    enricher = CatalogEnricher(tmp_path, sanitizer=sanitizer, model=sanitizer.model)
    enricher.enrich(catalog_with([entry("RHCP ❤️", "RHCP")]))

    enriched = enricher.enrich(
        catalog_with(
            [
                entry("RHCP ❤️", "RHCP"),
                entry("wallows 🤍", "wallows", index=1),
            ]
        )
    )

    assert len(sanitizer.calls) == 2
    assert len(sanitizer.calls[1]) == 1
    assert sanitizer.calls[1][0]["artist"] == "wallows"
    assert enriched["parsedCatalog"]["haveSeen"][1]["artist"] == "Wallows"
    assert enriched["enrichment"]["llmReviewedEntries"] == 1
    assert enriched["enrichment"]["cacheHits"] == 1


def test_disabled_enrichment_never_calls_sanitizer(tmp_path: Path) -> None:
    sanitizer = FakeSanitizer()
    enricher = CatalogEnricher(
        tmp_path,
        sanitizer=sanitizer,
        enabled=False,
        model=sanitizer.model,
    )

    enriched = enricher.enrich(catalog_with([entry("RHCP ❤️", "RHCP")]))

    assert sanitizer.calls == []
    assert enriched["parsedCatalog"]["haveSeen"][0]["artist"] == "RHCP"
    assert enriched["enrichment"]["status"] == "disabled"


def test_upcoming_entries_are_merged_and_keep_consistent_parsed_metadata(tmp_path: Path) -> None:
    sanitizer = FakeSanitizer()
    enricher = CatalogEnricher(tmp_path, sanitizer=sanitizer, model=sanitizer.model)
    catalog = catalog_with([])
    upcoming = entry("Sombr (Oct 10 Kia)", "sombr")
    upcoming.update({"status": "upcoming", "dateText": "Oct 10", "locationText": "Kia"})
    catalog["parsedCatalog"]["futureConcerts"] = [upcoming]

    enriched = enricher.enrich(catalog)

    result = enriched["parsedCatalog"]["futureConcerts"][0]
    assert result["artist"] == "Sombr"
    assert result["dateText"] == "Oct 10"
    assert result["locationText"] == "Kia"
    assert result["parsed"] == {"date": None, "venue": None, "city": None}
