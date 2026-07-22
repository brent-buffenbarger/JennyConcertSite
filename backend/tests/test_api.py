from __future__ import annotations

import base64
import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.concerts import ConcertsConflictError


ADMIN_USER = "test-admin"
ADMIN_PASS = "test-password"
ADMIN_HEADER = {
    "Authorization": "Basic " + base64.b64encode(f"{ADMIN_USER}:{ADMIN_PASS}".encode()).decode(),
}


@pytest.fixture(autouse=True)
def _admin_credentials(monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAME", ADMIN_USER)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASS)


class FakeConcertsService:
    def get_catalog(self):
        return {
            "schemaVersion": 2,
            "source": {
                "noteId": "note-1",
                "title": "Concerts",
                "account": "iCloud",
                "folder": "Notes",
                "createdAt": "2022-01-01T00:00:00Z",
                "modifiedAt": "2022-01-01T00:00:00Z",
                "exportedAt": "2022-01-01T00:00:00Z",
            },
            "rawExport": {
                "bodyHtml": "<div>Concerts</div>",
                "bodyText": "Concerts",
            },
            "parsedCatalog": {"wantToSee": [], "haveSeen": [], "futureConcerts": []},
        }

    def get_raw_export(self):
        return {
            "source": "Apple Notes",
            "noteCount": 1,
            "notes": [{"id": "note-1"}],
            "exportedAt": "2022-01-01T00:00:00Z",
        }

    def get_media_manifest(self):
        return {"schemaVersion": 2, "artists": [], "venues": []}

    def set_artist_image(self, artist: str, image_url: str):
        return {"schemaVersion": 2, "artists": [{"names": [artist], "imageUrl": image_url}], "venues": []}

    def list_uploads(self, artist=None, date=None):
        return {"items": []}

    def save_upload(self, artist, date, original_name, mime_type, source):
        content = source.read()
        return {
            "id": "upload-1",
            "artist": artist,
            "date": date,
            "originalName": original_name,
            "mediaType": "image",
            "mimeType": mime_type,
            "size": len(content),
            "uploadedAt": "2026-01-01T00:00:00Z",
            "url": "/api/concerts/uploads/upload-1/file",
        }

    def delete_upload(self, media_id):
        return {"deleted": media_id}

    def refresh_catalog(self, enrich: bool = True):
        return self.get_catalog()

    def append_line(self, _line: str):
        return self.get_catalog()

    def remove_line(self, _line: str):
        return self.get_catalog()

    def replace_body(self, _content: str):
        return self.get_catalog()

    def create_entry(self, _section: str, _raw: str, _expected_modified_at: str):
        return self.get_catalog()

    def update_entry(self, _section: str, _original_raw: str, _raw: str, _expected_modified_at: str):
        return self.get_catalog()


class ConflictingConcertsService(FakeConcertsService):
    def create_entry(self, _section: str, _raw: str, _expected_modified_at: str):
        raise ConcertsConflictError("Concerts note changed since it was loaded. Refresh and try again.")


def test_openapi_docs_exist() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.get("/openapi.json")
    assert response.status_code == 200
    payload = response.json()
    assert payload["info"]["title"] == "Jenny Concerts API"
    assert "/api/concerts/catalog" in payload["paths"]
    assert "/api/concerts/note/remove" not in payload["paths"]
    assert "/api/concerts/note/body" not in payload["paths"]


def test_get_catalog_returns_documented_payload() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.get("/api/concerts/catalog")
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"]["title"] == "Concerts"
    assert payload["schemaVersion"] == 2
    assert payload["parsedCatalog"]["futureConcerts"] == []


def test_get_media_returns_live_manifest() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.get("/api/concerts/media")

    assert response.status_code == 200
    assert response.json()["schemaVersion"] == 2


def test_set_artist_image_validates_and_returns_override() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.put("/api/concerts/media/artist", headers=ADMIN_HEADER, json={
        "artist": "New Artist",
        "imageUrl": "https://images.example.com/artist.jpg",
    })

    assert response.status_code == 200
    assert response.json()["artists"][0]["imageUrl"] == "https://images.example.com/artist.jpg"
    assert client.put(
        "/api/concerts/media/artist",
        headers=ADMIN_HEADER,
        json={"artist": "New Artist", "imageUrl": "javascript:alert(1)"},
    ).status_code == 422


def test_upload_concert_media_tags_artist_and_date() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/uploads",
        headers=ADMIN_HEADER,
        data={"artist": "Post Malone", "date": "2018-06-08"},
        files={"file": ("memory.jpg", b"image-bytes", "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["artist"] == "Post Malone"
    assert response.json()["date"] == "2018-06-08"
    assert response.json()["size"] == 11


def test_raw_upload_concert_media_tags_artist_and_date() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/uploads/raw",
        headers={
            **ADMIN_HEADER,
            "X-Concert-Artist": "Post Malone",
            "X-Concert-Date": "2018-06-08",
            "X-Concert-Filename": "memory.jpg",
            "X-Concert-Mime-Type": "image/jpeg",
            "Content-Type": "image/jpeg",
        },
        content=b"image-bytes",
    )

    assert response.status_code == 200
    assert response.json()["artist"] == "Post Malone"
    assert response.json()["date"] == "2018-06-08"


def test_delete_concert_media_returns_deleted_id() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.delete("/api/concerts/uploads/upload-1", headers=ADMIN_HEADER)

    assert response.status_code == 200
    assert response.json() == {"deleted": "upload-1"}


def test_append_endpoint_returns_mutation_response() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.patch("/api/concerts/note/append", headers=ADMIN_HEADER, json={"line": "SMOKE_TEST"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["action"] == "append_line"
    assert payload["catalog"]["source"]["title"] == "Concerts"


def test_create_and_update_entry_endpoints_return_mutation_responses() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    base = {
        "section": "haveSeen",
        "raw": "Artist - 07/18/2026 - Venue - ❤️",
        "expectedModifiedAt": "2022-01-01T00:00:00Z",
    }

    created = client.post("/api/concerts/note/entries", headers=ADMIN_HEADER, json=base)
    updated = client.patch("/api/concerts/note/entries", headers=ADMIN_HEADER, json={**base, "originalRaw": "Artist ❤️"})

    assert created.status_code == 200
    assert created.json()["action"] == "create_entry"
    assert updated.status_code == 200
    assert updated.json()["action"] == "update_entry"


def test_entry_mutation_rejects_multiline_and_noop_updates() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    base = {"section": "wantToSee", "expectedModifiedAt": "2022-01-01T00:00:00Z"}

    multiline = client.post("/api/concerts/note/entries", headers=ADMIN_HEADER, json={**base, "raw": "Artist\nHave seen"})
    noop = client.patch("/api/concerts/note/entries", headers=ADMIN_HEADER, json={**base, "raw": "Artist", "originalRaw": "Artist"})

    assert multiline.status_code == 422
    assert noop.status_code == 422


def test_stale_entry_mutation_returns_conflict() -> None:
    client = TestClient(create_app(ConflictingConcertsService()))
    response = client.post("/api/concerts/note/entries", headers=ADMIN_HEADER, json={
        "section": "wantToSee",
        "raw": "Artist",
        "expectedModifiedAt": "2022-01-01T00:00:00Z",
    })

    assert response.status_code == 409
    assert "Refresh and try again" in response.json()["detail"]


def test_mutation_without_credentials_returns_401() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post("/api/concerts/note/entries", json={
        "section": "wantToSee",
        "raw": "Artist",
        "expectedModifiedAt": "2022-01-01T00:00:00Z",
    })
    assert response.status_code == 401


def test_mutation_with_wrong_password_returns_401() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/note/entries",
        headers={"Authorization": "Basic " + base64.b64encode(b"test-admin:wrong").decode()},
        json={"section": "wantToSee", "raw": "Artist", "expectedModifiedAt": "2022-01-01T00:00:00Z"},
    )
    assert response.status_code == 401


def test_mutation_without_env_configured_returns_503(monkeypatch) -> None:
    monkeypatch.delenv("ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post("/api/concerts/note/entries", headers=ADMIN_HEADER, json={
        "section": "wantToSee",
        "raw": "Artist",
        "expectedModifiedAt": "2022-01-01T00:00:00Z",
    })
    assert response.status_code == 503


def test_get_endpoints_do_not_require_auth() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    assert client.get("/api/concerts/catalog").status_code == 200
    assert client.get("/api/concerts/media").status_code == 200
    assert client.get("/api/concerts/uploads").status_code == 200
    assert client.get("/health").status_code == 200


def test_cors_preflight_allows_configured_origin(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.pages.dev,https://jennyconcerts.com")
    client = TestClient(create_app(FakeConcertsService()))
    response = client.options(
        "/api/concerts/note/entries",
        headers={
            "Origin": "https://jennyconcerts.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://jennyconcerts.com"
