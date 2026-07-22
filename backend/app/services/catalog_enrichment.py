from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol

from dotenv import load_dotenv
from pydantic import BaseModel, Field


RESOLVER_VERSION = 2
DEFAULT_MODEL = "gpt-5.6"

SYSTEM_PROMPT = """You clean structured concert-list entries for a personal website.

For every input entry:
- Keep `key` exactly unchanged.
- Return a canonical artist display name with correct capitalization and punctuation.
- Expand an obvious artist abbreviation only when highly confident (for example, RHCP means Red Hot Chili Peppers).
- Move non-artist wording such as ticket comments or personal context into `notes`.
- Clean obvious shorthand in notes while preserving the person's meaning and tone.
- Preserve date and location text unless a cleanup is unambiguous.
- Never invent a date, venue, city, address, concert, or artist identity.
- If an interpretation is uncertain, preserve the current value, lower confidence, and set `needs_review` to true.
- Use null for absent notes, date text, or location text.
- Briefly list meaningful edits in `changes`; return an empty list when nothing changed.

The heart-derived status and rating are intentionally not part of the output and must not be reinterpreted.
"""


class CatalogEnrichmentError(RuntimeError):
    """Raised when catalog enrichment cannot complete safely."""


class SanitizedConcertEntry(BaseModel):
    key: str = Field(min_length=1)
    artist: str = Field(min_length=1)
    notes: Optional[str]
    date_text: Optional[str]
    location_text: Optional[str]
    confidence: float = Field(ge=0, le=1)
    needs_review: bool
    changes: List[str]


class SanitizedConcertBatch(BaseModel):
    entries: List[SanitizedConcertEntry]


class ConcertSanitizer(Protocol):
    model: str

    def sanitize(self, entries: List[Dict[str, Any]]) -> List[SanitizedConcertEntry]:
        """Return validated sanitization results for the supplied entries."""


class OpenAIConcertSanitizer:
    """Uses OpenAI Structured Outputs to sanitize a batch of concert entries."""

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, client: Any = None):
        self.model = model
        if client is not None:
            self._client = client
            return

        try:
            from openai import OpenAI
        except ImportError as exc:
            raise CatalogEnrichmentError(
                "The openai package is required when OpenAI enrichment is enabled."
            ) from exc

        self._client = OpenAI(api_key=api_key)

    def sanitize(self, entries: List[Dict[str, Any]]) -> List[SanitizedConcertEntry]:
        try:
            response = self._client.responses.parse(
                model=self.model,
                store=False,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": json.dumps({"entries": entries}, ensure_ascii=False),
                    },
                ],
                text_format=SanitizedConcertBatch,
            )
        except Exception as exc:
            raise CatalogEnrichmentError(
                f"OpenAI catalog enrichment request failed: {exc}"
            ) from exc
        parsed = response.output_parsed
        if parsed is None:
            raise CatalogEnrichmentError(
                "OpenAI returned no parsed catalog enrichment output."
            )
        return parsed.entries


@dataclass
class CatalogEnricher:
    project_root: Path
    sanitizer: Optional[ConcertSanitizer]
    enabled: bool = True
    model: str = DEFAULT_MODEL
    resolver_version: int = RESOLVER_VERSION

    @classmethod
    def from_env(cls, project_root: Path) -> "CatalogEnricher":
        load_dotenv(project_root / "backend" / ".env")

        enabled = os.getenv("OPENAI_ENRICHMENT_ENABLED", "true").lower() not in {
            "0",
            "false",
            "no",
            "off",
        }
        model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
        api_key = os.getenv("OPENAI_API_KEY")
        sanitizer = (
            OpenAIConcertSanitizer(api_key=api_key, model=model)
            if enabled and api_key
            else None
        )
        return cls(
            project_root=project_root,
            sanitizer=sanitizer,
            enabled=enabled,
            model=model,
        )

    @property
    def cache_path(self) -> Path:
        return self.project_root / "data" / "notes" / "concerts.enrichment.json"

    @property
    def output_path(self) -> Path:
        return self.project_root / "data" / "notes" / "concerts.enriched.json"

    def enrich(self, catalog: Dict[str, Any]) -> Dict[str, Any]:
        source_hash = self._source_hash(catalog)
        cache = self._read_cache()
        flattened = self._flatten_entries(catalog)
        now = self._now()

        if (
            cache.get("sourceHash") == source_hash
            and cache.get("resolverVersion") == self.resolver_version
            and cache.get("status") == "complete"
            and cache.get("model") == self.model
            and self.output_path.exists()
        ):
            enriched = self._read_json(self.output_path)
            metadata = enriched.setdefault("enrichment", {})
            if (
                metadata.get("sourceHash") == source_hash
                and metadata.get("resolverVersion") == self.resolver_version
                and metadata.get("model") == self.model
            ):
                metadata.update(
                    {
                        "lastCheckedAt": now,
                        "llmReviewedEntries": 0,
                        "cacheHits": len(flattened),
                    }
                )
                self._write_json(self.output_path, enriched)
                return enriched

        cached_entries = cache.get("entries", {})
        pending = [
            item
            for item in flattened
            if not self._usable_cache_record(cached_entries.get(item["key"]))
        ]

        if pending and self.enabled and self.sanitizer is None:
            raise CatalogEnrichmentError(
                "New concert data needs OpenAI review, but OPENAI_API_KEY is not configured. "
                "Add it to backend/.env or disable enrichment with OPENAI_ENRICHMENT_ENABLED=false."
            )

        reviewed_count = 0
        if pending and self.enabled:
            results = self.sanitizer.sanitize([item["payload"] for item in pending])  # type: ignore[union-attr]
            self._validate_result_keys(pending, results)
            reviewed_count = len(results)
            for result in results:
                cached_entries[result.key] = {
                    "resolverVersion": self.resolver_version,
                    "resolvedBy": "openai",
                    "model": self.model,
                    "resolvedAt": now,
                    "result": result.model_dump(),
                }
        elif pending:
            for item in pending:
                payload = item["payload"]
                cached_entries[item["key"]] = {
                    "resolverVersion": self.resolver_version,
                    "resolvedBy": "deterministic",
                    "model": None,
                    "resolvedAt": now,
                    "result": {
                        "key": item["key"],
                        "artist": payload["artist"],
                        "notes": payload["notes"],
                        "date_text": payload["date_text"],
                        "location_text": payload["location_text"],
                        "confidence": 1,
                        "needs_review": False,
                        "changes": [],
                    },
                }

        enriched = self._merge(catalog, cached_entries)
        status = "complete" if self.enabled else "disabled"
        cache_hits = len(flattened) - len(pending)
        enriched["enrichment"] = {
            "status": status,
            "sourceHash": source_hash,
            "model": self.model if self.enabled else None,
            "resolverVersion": self.resolver_version,
            "reviewedAt": now,
            "lastCheckedAt": now,
            "totalEntries": len(flattened),
            "llmReviewedEntries": reviewed_count,
            "cacheHits": cache_hits,
            "needsReview": sum(
                1
                for item in flattened
                if cached_entries[item["key"]]["result"]["needs_review"]
            ),
        }

        self._write_json(
            self.cache_path,
            {
                "schemaVersion": 1,
                "resolverVersion": self.resolver_version,
                "status": status,
                "sourceHash": source_hash,
                "model": self.model if self.enabled else None,
                "updatedAt": now,
                "entries": cached_entries,
            },
        )
        self._write_json(self.output_path, enriched)
        return enriched

    def _usable_cache_record(self, record: Optional[Dict[str, Any]]) -> bool:
        if not record or record.get("resolverVersion") != self.resolver_version:
            return False
        if self.enabled and record.get("resolvedBy") != "openai":
            return False
        if self.enabled and record.get("model") != self.model:
            return False
        return bool(record.get("result"))

    def _flatten_entries(self, catalog: Dict[str, Any]) -> List[Dict[str, Any]]:
        parsed = catalog.get("parsedCatalog")
        if not isinstance(parsed, dict):
            raise CatalogEnrichmentError("Catalog is missing parsedCatalog data.")

        flattened: List[Dict[str, Any]] = []
        for section in ("wantToSee", "haveSeen", "futureConcerts"):
            entries = parsed.get(section, [])
            if not isinstance(entries, list):
                raise CatalogEnrichmentError(f"Catalog section {section} must be a list.")
            for entry in entries:
                key = self._entry_key(section, entry)
                flattened.append(
                    {
                        "key": key,
                        "section": section,
                        "entry": entry,
                        "payload": {
                            "key": key,
                            "section": section,
                            "raw": entry.get("raw", ""),
                            "artist": entry.get("artist", ""),
                            "notes": entry.get("notes"),
                            "date_text": entry.get("dateText"),
                            "location_text": entry.get("locationText"),
                            "status": entry.get("status"),
                            "rating": entry.get("rating"),
                        },
                    }
                )
        return flattened

    def _merge(
        self, catalog: Dict[str, Any], cached_entries: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        enriched = copy.deepcopy(catalog)
        for section in ("wantToSee", "haveSeen", "futureConcerts"):
            for entry in enriched["parsedCatalog"][section]:
                key = self._entry_key(section, entry)
                record = cached_entries.get(key)
                if not record:
                    raise CatalogEnrichmentError(
                        f"No enrichment cache record exists for entry {key}."
                    )
                result = record["result"]
                entry["artist"] = result["artist"].strip()
                entry["artistKey"] = self._artist_key(result["artist"])
                entry["notes"] = self._clean_optional(result.get("notes"))
                entry["dateText"] = self._clean_optional(result.get("date_text"))
                entry["locationText"] = self._clean_optional(
                    result.get("location_text")
                )
                entry["parsed"] = self._parsed_metadata(entry)
                entry["enrichment"] = {
                    "confidence": result["confidence"],
                    "needsReview": result["needs_review"],
                    "changes": result["changes"],
                    "resolvedBy": record["resolvedBy"],
                    "model": record.get("model"),
                    "resolvedAt": record["resolvedAt"],
                }
        return enriched

    @staticmethod
    def _parsed_metadata(entry: Dict[str, Any]) -> Dict[str, Optional[str]]:
        date_text = entry.get("dateText")
        normalized_date = None
        if date_text:
            try:
                normalized_date = datetime.strptime(date_text, "%m/%d/%Y").date().isoformat()
            except ValueError:
                normalized_date = None
        location = entry.get("locationText")
        return {
            "date": normalized_date,
            "venue": location if entry.get("status") == "seen" else None,
            "city": None,
        }

    def _entry_key(self, section: str, entry: Dict[str, Any]) -> str:
        identity = {
            "resolverVersion": self.resolver_version,
            "section": section,
            "raw": self._normalized(entry.get("raw")),
            "artist": self._normalized(entry.get("artist")),
            "notes": self._normalized(entry.get("notes")),
            "dateText": self._normalized(entry.get("dateText")),
            "locationText": self._normalized(entry.get("locationText")),
            "status": entry.get("status"),
            "rating": entry.get("rating"),
        }
        return hashlib.sha256(self._stable_json(identity).encode("utf-8")).hexdigest()

    def _source_hash(self, catalog: Dict[str, Any]) -> str:
        parsed = catalog.get("parsedCatalog")
        if parsed is None:
            raise CatalogEnrichmentError("Catalog is missing parsedCatalog data.")
        return hashlib.sha256(self._stable_json(parsed).encode("utf-8")).hexdigest()

    def _validate_result_keys(
        self,
        pending: List[Dict[str, Any]],
        results: List[SanitizedConcertEntry],
    ) -> None:
        expected = {item["key"] for item in pending}
        actual = {result.key for result in results}
        if expected != actual or len(results) != len(actual):
            raise CatalogEnrichmentError(
                "OpenAI enrichment returned missing, duplicate, or unexpected entry keys."
            )

    def _read_cache(self) -> Dict[str, Any]:
        if not self.cache_path.exists():
            return {"entries": {}}
        return self._read_json(self.cache_path)

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CatalogEnrichmentError(f"Failed to read JSON from {path}: {exc}") from exc

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)

    @staticmethod
    def _stable_json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _normalized(value: Any) -> Optional[str]:
        if value is None:
            return None
        return " ".join(str(value).split()).casefold()

    @staticmethod
    def _clean_optional(value: Any) -> Optional[str]:
        if value is None:
            return None
        cleaned = " ".join(str(value).split())
        return cleaned or None

    @staticmethod
    def _artist_key(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
        return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
