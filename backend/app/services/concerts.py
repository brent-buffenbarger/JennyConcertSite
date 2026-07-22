from __future__ import annotations

import json
import hashlib
import os
import re
import subprocess
import threading
import time
import unicodedata
import warnings
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .catalog_enrichment import CatalogEnricher, CatalogEnrichmentError
from .venue_geocoding import VenueGeocodingError, geocode_venue, normalize_venue_key


class ConcertsServiceError(RuntimeError):
    """Raised when the Concerts note workflow fails."""


class ConcertsConflictError(ConcertsServiceError):
    """Raised when the live note changed after the client loaded it."""


class ConcertUploadError(ConcertsServiceError):
    """Raised when a concert upload is invalid or cannot be stored."""


@dataclass
class ConcertsService:
    project_root: Path
    enricher: Optional[CatalogEnricher] = None

    _upload_lock = threading.Lock()

    ALLOWED_UPLOAD_TYPES = {
        "image/jpeg": ("image", ".jpg"),
        "image/png": ("image", ".png"),
        "image/gif": ("image", ".gif"),
        "image/webp": ("image", ".webp"),
        "image/avif": ("image", ".avif"),
        "video/mp4": ("video", ".mp4"),
        "video/webm": ("video", ".webm"),
        "video/quicktime": ("video", ".mov"),
    }
    MAX_UPLOAD_BYTES = 250 * 1024 * 1024

    @classmethod
    def for_project(cls, project_root: Optional[Path] = None) -> "ConcertsService":
        if project_root is None:
            project_root = Path(__file__).resolve().parents[3]
        return cls(
            project_root=project_root,
            enricher=CatalogEnricher.from_env(project_root),
        )

    @property
    def base_catalog_path(self) -> Path:
        return self.project_root / "data" / "notes" / "concerts.catalog.json"

    @property
    def enriched_catalog_path(self) -> Path:
        return self.project_root / "data" / "notes" / "concerts.enriched.json"

    @property
    def raw_export_path(self) -> Path:
        return self.project_root / "data" / "notes" / "concerts.json"

    @property
    def media_manifest_path(self) -> Path:
        return self.project_root / "frontend" / "src" / "data" / "concert-media.json"

    @property
    def venue_details_path(self) -> Path:
        return self.project_root / "frontend" / "src" / "data" / "venue-details.json"

    @property
    def upload_root(self) -> Path:
        return self.project_root / "data" / "concert-uploads"

    @property
    def upload_index_path(self) -> Path:
        return self.upload_root / "index.json"

    def get_catalog(self) -> Dict[str, Any]:
        base = self._read_json(self.base_catalog_path)
        if not self.enriched_catalog_path.exists():
            return base

        enriched = self._read_json(self.enriched_catalog_path)
        base_modified = base.get("source", {}).get("modifiedAt")
        enriched_modified = enriched.get("source", {}).get("modifiedAt")
        same_schema = base.get("schemaVersion") == enriched.get("schemaVersion")
        expected_hash = hashlib.sha256(
            json.dumps(
                base.get("parsedCatalog"),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        enriched_hash = enriched.get("enrichment", {}).get("sourceHash")
        return enriched if same_schema and base_modified == enriched_modified and expected_hash == enriched_hash else base

    def get_raw_export(self) -> Dict[str, Any]:
        return self._read_json(self.raw_export_path)

    def get_media_manifest(self) -> Dict[str, Any]:
        manifest = self._read_json(self.media_manifest_path)
        # Attach venue-details so the frontend has one place to pull dynamic venue data.
        try:
            venue_details = self._read_json(self.venue_details_path)
        except ConcertsServiceError:
            venue_details = {"schemaVersion": 1, "venues": []}
        manifest["venueDetails"] = venue_details.get("venues", [])
        return manifest

    def get_venue_details(self) -> Dict[str, Any]:
        try:
            return self._read_json(self.venue_details_path)
        except ConcertsServiceError:
            return {"schemaVersion": 1, "generatedAt": None, "venues": []}

    def set_artist_image(self, artist: str, image_url: str) -> Dict[str, Any]:
        manifest = self.get_media_manifest()
        lookup_key = self._normalize_media_name(artist)
        records = manifest.get("artists", [])
        manifest["artists"] = [
            record
            for record in records
            if not (
                record.get("rightsClass") == "user-provided"
                and any(self._normalize_media_name(name) == lookup_key for name in record.get("names", []))
            )
        ]
        manifest["artists"].append({
            "key": f"manual-{re.sub(r'[^a-z0-9]+', '-', lookup_key).strip('-')}",
            "names": [artist],
            "title": f"{artist} custom artist image",
            "imageUrl": image_url,
            "width": None,
            "height": None,
            "sourceUrl": image_url,
            "originalUrl": image_url,
            "sourceSha1": None,
            "localSha256": None,
            "creator": "User-provided image URL",
            "licenseName": "Source image",
            "licenseUrl": image_url,
            "creditText": "Custom image URL",
            "modifications": "Displayed remotely and cropped for card display",
            "provider": "Manual override",
            "providerId": None,
            "rightsClass": "user-provided",
        })
        manifest["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        temporary_path = self.media_manifest_path.with_name(
            f"{self.media_manifest_path.name}.tmp-{os.getpid()}"
        )
        try:
            temporary_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            temporary_path.replace(self.media_manifest_path)
        except OSError as exc:
            temporary_path.unlink(missing_ok=True)
            raise ConcertsServiceError(f"Failed to save artist image override: {exc}") from exc
        return manifest

    def list_uploads(self, artist: Optional[str] = None, date: Optional[str] = None) -> Dict[str, Any]:
        items = self._read_upload_index().get("items", [])
        if artist:
            artist_key = self._normalize_media_name(artist)
            items = [item for item in items if self._normalize_media_name(item.get("artist", "")) == artist_key]
        if date:
            items = [item for item in items if item.get("date") == date]
        return {"items": items}

    def save_upload(self, artist: str, date: str, original_name: str, mime_type: str, source) -> Dict[str, Any]:
        if mime_type not in self.ALLOWED_UPLOAD_TYPES:
            raise ConcertUploadError("Use a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, or QuickTime file.")
        media_type, extension = self.ALLOWED_UPLOAD_TYPES[mime_type]
        media_id = uuid.uuid4().hex
        self.upload_root.mkdir(parents=True, exist_ok=True)
        destination = self.upload_root / f"{media_id}{extension}"
        temporary = self.upload_root / f".{media_id}.upload"
        size = 0
        try:
            with temporary.open("wb") as output:
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.MAX_UPLOAD_BYTES:
                        raise ConcertUploadError("Upload is larger than the 250 MB limit.")
                    output.write(chunk)
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
            raise

        item = {
            "id": media_id,
            "artist": artist.strip(),
            "date": date.strip(),
            "originalName": Path(original_name or f"upload{extension}").name,
            "mediaType": media_type,
            "mimeType": mime_type,
            "size": size,
            "uploadedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "url": f"/api/concerts/uploads/{media_id}/file",
        }
        try:
            with self._upload_lock:
                index = self._read_upload_index()
                index.setdefault("items", []).append(item)
                self._write_upload_index(index)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        return item

    def get_upload_file(self, media_id: str) -> tuple[Dict[str, Any], Path]:
        item = next((candidate for candidate in self._read_upload_index().get("items", []) if candidate.get("id") == media_id), None)
        if not item:
            raise ConcertUploadError("Concert upload was not found.")
        matches = list(self.upload_root.glob(f"{media_id}.*"))
        if len(matches) != 1 or not matches[0].is_file():
            raise ConcertUploadError("Concert upload file is missing.")
        return item, matches[0]

    def delete_upload(self, media_id: str) -> Dict[str, Any]:
        with self._upload_lock:
            index = self._read_upload_index()
            items = index.get("items", [])
            item = next((candidate for candidate in items if candidate.get("id") == media_id), None)
            if not item:
                raise ConcertUploadError("Concert upload was not found.")
            index["items"] = [candidate for candidate in items if candidate.get("id") != media_id]
            self._write_upload_index(index)

        for path in self.upload_root.glob(f"{media_id}.*"):
            path.unlink(missing_ok=True)
        return {"deleted": media_id}

    def _read_upload_index(self) -> Dict[str, Any]:
        if not self.upload_index_path.exists():
            return {"schemaVersion": 1, "items": []}
        return self._read_json(self.upload_index_path)

    def _write_upload_index(self, index: Dict[str, Any]) -> None:
        self.upload_root.mkdir(parents=True, exist_ok=True)
        temporary = self.upload_index_path.with_name(f"{self.upload_index_path.name}.tmp-{os.getpid()}")
        try:
            temporary.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary.replace(self.upload_index_path)
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            raise ConcertsServiceError(f"Failed to update concert upload metadata: {exc}") from exc

    @staticmethod
    def _normalize_media_name(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        without_marks = "".join(character for character in normalized if not unicodedata.combining(character))
        return re.sub(r"[^a-z0-9]+", " ", without_marks.lower().replace("&", " and ")).strip()

    def refresh_catalog(self, enrich: bool = True) -> Dict[str, Any]:
        base = self._refresh_base_catalog()
        if self.enricher is None or not enrich:
            catalog = base
        else:
            try:
                catalog = self.enricher.enrich(base)
            except CatalogEnrichmentError as exc:
                warnings.warn(f"OpenAI enrichment skipped: {exc}", RuntimeWarning)
                catalog = base
        self._ensure_artist_media(catalog)
        self._ensure_venue_details(catalog)
        return catalog

    def _refresh_base_catalog(self) -> Dict[str, Any]:
        last_error: Optional[ConcertsServiceError] = None
        for attempt in range(3):
            try:
                self._run_node_script("scripts/export-concerts-notes.mjs")
                self._run_node_script("scripts/build-concerts-catalog.mjs")
                return self._read_json(self.base_catalog_path)
            except ConcertsServiceError as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(0.5 * (attempt + 1))
        raise ConcertsServiceError(f"Could not refresh Apple Notes after 3 attempts: {last_error}") from last_error

    def append_line(self, line: str) -> Dict[str, Any]:
        self._run_node_script("scripts/append-concerts-note.mjs", line)
        return self.refresh_catalog(enrich=False)

    def remove_line(self, line: str) -> Dict[str, Any]:
        self._run_node_script("scripts/remove-from-concerts-note.mjs", line)
        return self.refresh_catalog(enrich=False)

    def replace_body(self, content: str) -> Dict[str, Any]:
        self._run_node_script("scripts/replace-concerts-note.mjs", content)
        return self.refresh_catalog(enrich=False)

    def create_entry(self, section: str, raw: str, expected_modified_at: str) -> Dict[str, Any]:
        payload = json.dumps({
            "action": "create",
            "section": section,
            "raw": raw,
            "expectedModifiedAt": expected_modified_at,
        }, ensure_ascii=False)
        self._run_node_script("scripts/mutate-concert-entry.mjs", payload)
        return self.refresh_catalog(enrich=False)

    def update_entry(self, section: str, original_raw: str, raw: str, expected_modified_at: str) -> Dict[str, Any]:
        payload = json.dumps({
            "action": "update",
            "section": section,
            "originalRaw": original_raw,
            "raw": raw,
            "expectedModifiedAt": expected_modified_at,
        }, ensure_ascii=False)
        self._run_node_script("scripts/mutate-concert-entry.mjs", payload)
        return self.refresh_catalog(enrich=False)

    def _ensure_venue_details(self, catalog: Dict[str, Any]) -> None:
        """Geocode any venues in the catalog that aren't yet in venue-details.json.

        Nominatim is best-effort: if it fails or returns no useful hit, we skip
        that venue silently. Notes writes remain successful.
        """
        details_payload = self.get_venue_details()
        records: list[Dict[str, Any]] = list(details_payload.get("venues", []))
        # Build a fast lookup by normalized key (respecting all name aliases).
        known_keys: set[str] = set()
        for record in records:
            for alias in record.get("names") or ([record.get("name")] if record.get("name") else []):
                key = normalize_venue_key(alias or "")
                if key:
                    known_keys.add(key)

        # Collect (name, city_hint) tuples for venues not yet known.
        seen_in_this_pass: set[str] = set()
        pending: list[tuple[str, Optional[str]]] = []
        for section in catalog.get("parsedCatalog", {}).values():
            for entry in section:
                raw_venue = (entry.get("parsed") or {}).get("venue") or entry.get("locationText")
                if not raw_venue:
                    continue
                key = normalize_venue_key(raw_venue)
                if not key or key in known_keys or key in seen_in_this_pass:
                    continue
                seen_in_this_pass.add(key)
                city_hint = (entry.get("parsed") or {}).get("locationText") or entry.get("locationText")
                pending.append((raw_venue, city_hint if city_hint and city_hint != raw_venue else None))

        if not pending:
            return

        added: list[Dict[str, Any]] = []
        for raw_venue, city_hint in pending:
            try:
                result = geocode_venue(raw_venue, city_hint)
            except VenueGeocodingError as exc:
                warnings.warn(f"Venue geocoding skipped for {raw_venue!r}: {exc}", RuntimeWarning)
                continue
            if result is None:
                # Nothing plausible found. Record a stub so we don't retry every write.
                record = {
                    "key": normalize_venue_key(raw_venue),
                    "names": [raw_venue],
                    "name": raw_venue,
                    "city": city_hint,
                    "neighborhood": None,
                    "venueType": None,
                    "lat": None,
                    "lng": None,
                    "verified": False,
                    "source": "unresolved",
                }
            else:
                record = {
                    "key": normalize_venue_key(raw_venue),
                    "names": [raw_venue],
                    **result,
                }
            added.append(record)

        if not added:
            return

        records.extend(added)
        payload = {
            "schemaVersion": details_payload.get("schemaVersion", 1),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "venues": records,
        }
        self.venue_details_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.venue_details_path.with_name(
            f"{self.venue_details_path.name}.tmp-{os.getpid()}"
        )
        try:
            temporary_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            temporary_path.replace(self.venue_details_path)
        except OSError as exc:
            temporary_path.unlink(missing_ok=True)
            warnings.warn(f"Failed to save venue-details.json: {exc}", RuntimeWarning)

    def _ensure_artist_media(self, catalog: Dict[str, Any]) -> None:
        artists = [
            entry.get("artist")
            for entries in catalog.get("parsedCatalog", {}).values()
            for entry in entries
            if entry.get("artist")
        ]
        if not artists:
            return
        try:
            self._run_node_script(
                "scripts/ensure-concert-artist-media.mjs",
                json.dumps(artists, ensure_ascii=False),
            )
        except ConcertsServiceError:
            # Notes and catalog updates remain successful when image lookup is unavailable.
            return

    def _read_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            raise ConcertsServiceError(f"Expected file at {path} but it does not exist.")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ConcertsServiceError(f"Failed to decode JSON from {path}: {exc}") from exc

    def _run_node_script(self, relative_script_path: str, *args: str) -> None:
        command = ["node", relative_script_path, *args]
        try:
            subprocess.run(
                command,
                cwd=self.project_root,
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )
        except FileNotFoundError as exc:
            raise ConcertsServiceError("Node.js is required to execute the Notes integration scripts.") from exc
        except subprocess.TimeoutExpired as exc:
            raise ConcertsServiceError(f"Command {' '.join(command)} timed out while waiting for Apple Notes.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            details = stderr or stdout or str(exc)
            if "Concerts note changed since it was loaded" in details:
                raise ConcertsConflictError("Concerts note changed since it was loaded. Refresh and try again.") from exc
            raise ConcertsServiceError(f"Command {' '.join(command)} failed: {details}") from exc
