from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


PUBLISH_TOKEN = "publish-notes-token"


@pytest.fixture(autouse=True)
def _publish_token(monkeypatch):
    monkeypatch.setenv("PUBLISH_NOTES_TOKEN", PUBLISH_TOKEN)


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

    def publish_notes(self, **_kwargs):
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
def test_openapi_docs_exist() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.get("/openapi.json")
    assert response.status_code == 200
    payload = response.json()
    assert payload["info"]["title"] == "Jenny Concerts API"
    assert "/api/concerts/catalog" in payload["paths"]
    assert "/api/concerts/refresh" in payload["paths"]
    assert "/api/concerts/publish-notes" in payload["paths"]
    assert "/api/concerts/source" not in payload["paths"]
    assert "/api/concerts/note/entries" not in payload["paths"]
    assert "/api/concerts/uploads/{media_id}" not in payload["paths"]


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
    response = client.put("/api/concerts/media/artist", json={
        "artist": "New Artist",
        "imageUrl": "https://images.example.com/artist.jpg",
    })

    assert response.status_code == 200
    assert response.json()["artists"][0]["imageUrl"] == "https://images.example.com/artist.jpg"
    assert client.put(
        "/api/concerts/media/artist",
        json={"artist": "New Artist", "imageUrl": "javascript:alert(1)"},
    ).status_code == 422


def test_upload_concert_media_tags_artist_and_date() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/uploads",
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


def test_delete_concert_media_route_is_not_exposed() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.delete("/api/concerts/uploads/upload-1")
    assert response.status_code == 404


def test_refresh_route_is_public_and_returns_catalog() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post("/api/concerts/refresh")
    assert response.status_code == 200
    assert response.json()["source"]["title"] == "Concerts"


def test_publish_notes_route_accepts_note_body_and_returns_catalog() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/publish-notes",
        headers={"X-Publish-Token": PUBLISH_TOKEN},
        json={
            "bodyText": "Concerts\n\nWant to see\n\nGlass Animals",
            "title": "Concerts",
            "sourceDevice": "Jenny's iPhone",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["action"] == "publish_notes"
    assert payload["sourceDevice"] == "Jenny's iPhone"
    assert payload["catalog"]["source"]["title"] == "Concerts"


def test_publish_notes_requires_token() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/publish-notes",
        json={"bodyText": "Concerts\n\nWant to see\n\nGlass Animals"},
    )
    assert response.status_code == 401


def test_publish_notes_rejects_wrong_token() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/publish-notes",
        headers={"X-Publish-Token": "wrong-token"},
        json={"bodyText": "Concerts\n\nWant to see\n\nGlass Animals"},
    )
    assert response.status_code == 401


def test_publish_notes_returns_503_when_token_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("PUBLISH_NOTES_TOKEN", raising=False)
    client = TestClient(create_app(FakeConcertsService()))
    response = client.post(
        "/api/concerts/publish-notes",
        headers={"X-Publish-Token": PUBLISH_TOKEN},
        json={"bodyText": "Concerts\n\nWant to see\n\nGlass Animals"},
    )
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
        "/api/concerts/uploads/raw",
        headers={
            "Origin": "https://jennyconcerts.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-concert-artist,x-concert-date,x-concert-filename,x-concert-mime-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://jennyconcerts.com"


def test_notes_mutation_routes_are_not_exposed() -> None:
    client = TestClient(create_app(FakeConcertsService()))
    assert client.post("/api/concerts/note/entries", json={}).status_code == 404
    assert client.patch("/api/concerts/note/entries", json={}).status_code == 404
    assert client.patch("/api/concerts/note/append", json={}).status_code == 404
    assert client.get("/api/concerts/source").status_code == 404
