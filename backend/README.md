# Jenny Concerts API

FastAPI backend for reading the Concerts Apple Note, building the website catalog, and optionally cleaning new or changed entries with OpenAI.

## Setup

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e "backend[dev]"
cp backend/.env.example backend/.env
```

Add your API key to `backend/.env`:

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.6
OPENAI_ENRICHMENT_ENABLED=true
PUBLISH_NOTES_TOKEN=change-me-to-a-long-random-string
```

`backend/.env` is ignored by Git. Never expose `OPENAI_API_KEY` to the frontend or commit it.

## Run

```bash
uvicorn app.main:app --app-dir backend --reload
```

- Swagger UI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

## Enrichment Behavior

- `GET /api/concerts/catalog` only reads cached files and never calls OpenAI.
- `POST /api/concerts/refresh` exports Notes, runs the deterministic parser, and checks hashes.
- OpenAI receives one structured batch containing only new or changed entries.
- Existing entry results are reused from `data/notes/concerts.enrichment.json`.
- Cleaned output is written to `data/notes/concerts.enriched.json`.
- The deterministic source remains at `data/notes/concerts.catalog.json`.
- Raw source lines, statuses, and heart ratings are never replaced by the model.

## Notes-Driven Public API

This site is intentionally **Notes-driven** in production:

- Concert entries are added, removed, and edited in Apple Notes, not through the website.
- The public API exposes read endpoints plus two write capabilities only:
  - `PUT /api/concerts/media/artist` stores a validated HTTP(S) image URL as the preferred image for one artist.
  - `POST /api/concerts/uploads` and `POST /api/concerts/uploads/raw` store website-only concert photos and videos.
- A third trusted-device path exists for cloud hosting:
  - `POST /api/concerts/publish-notes` accepts the full Concerts note body from a Shortcut, rebuilds the catalog on the server, and returns the refreshed catalog.
  - This route is protected by the `X-Publish-Token` header and the `PUBLISH_NOTES_TOKEN` env var.
- The backend still knows how to refresh and mutate the Notes-backed catalog internally, but those note-mutation routes are intentionally not exposed over HTTP.
- Refreshes resolve exact-match Deezer profile images for artists not already present in the live media manifest.
- `GET /api/concerts/media` returns the live manifest plus venue-details so newly resolved images and geocoded venues appear without a frontend rebuild.

### Publish Notes request shape

`POST /api/concerts/publish-notes`

Headers:

```http
X-Publish-Token: <your-shared-secret>
Content-Type: application/json
```

Body:

```json
{
  "bodyText": "Concerts\n\nWant to see\n\nGlass Animals",
  "title": "Concerts",
  "noteId": "optional-stable-device-note-id",
  "account": "iCloud",
  "folder": "Notes",
  "modifiedAt": "2026-07-29T04:12:00Z",
  "sourceDevice": "Jenny's iPhone"
}
```

Minimum required field is `bodyText`. The optional metadata improves provenance and makes it easier to debug which device last published.

OpenAI enrichment is optional at runtime. Authentication, quota, or service failures emit a backend warning and fall back to the deterministic parser, so a successful Notes write is never reported as failed solely because enrichment is unavailable.

## Concert Uploads

- `GET /api/concerts/uploads` browses website-only concert media and supports artist/date filters.
- `POST /api/concerts/uploads` accepts multipart image/video uploads tagged with artist and date.
- `GET /api/concerts/uploads/{id}/file` streams stored media inline.
- Files and metadata live under `data/concert-uploads/` and are intentionally excluded from source control.
- Supported formats are JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, and QuickTime, up to 250 MB per file.

If enrichment is intentionally disabled, set:

```dotenv
OPENAI_ENRICHMENT_ENABLED=false
```

## Tests

```bash
pytest backend/tests
```
