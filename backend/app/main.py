from __future__ import annotations

import os
import secrets
from tempfile import SpooledTemporaryFile
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .schemas import (
    AppendLineRequest,
    ArtistImageRequest,
    ConcertUpload,
    ConcertUploadList,
    ConcertEntryMutationRequest,
    ConcertsCatalogResponse,
    MutationResponse,
    NotesRawExportResponse,
    UpdateConcertEntryRequest,
)
from .services.concerts import ConcertsConflictError, ConcertsService, ConcertsServiceError, ConcertUploadError


def get_concerts_service(request: Request) -> ConcertsService:
    return request.app.state.concerts_service


_basic_scheme = HTTPBasic(auto_error=False)


def require_admin(credentials: Optional[HTTPBasicCredentials] = Depends(_basic_scheme)) -> None:
    """Guard write endpoints with HTTP Basic auth.

    Credentials come from the ADMIN_USERNAME and ADMIN_PASSWORD environment variables.
    If either is unset, writes are denied entirely so the site fails closed rather than
    silently accepting anonymous mutations.
    """
    expected_user = os.getenv("ADMIN_USERNAME", "").strip()
    expected_pass = os.getenv("ADMIN_PASSWORD", "").strip()
    if not expected_user or not expected_pass:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Editing is not configured on this backend. Set ADMIN_USERNAME and ADMIN_PASSWORD.",
            headers={"WWW-Authenticate": 'Basic realm="Jenny Concerts"'},
        )
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Editing requires authentication.",
            headers={"WWW-Authenticate": 'Basic realm="Jenny Concerts"'},
        )
    valid_user = secrets.compare_digest(credentials.username.encode(), expected_user.encode())
    valid_pass = secrets.compare_digest(credentials.password.encode(), expected_pass.encode())
    if not (valid_user and valid_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": 'Basic realm="Jenny Concerts"'},
        )


def service_call(action):
    try:
        return action()
    except ConcertsConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ConcertUploadError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ConcertsServiceError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


def create_app(service: Optional[ConcertsService] = None) -> FastAPI:
    app = FastAPI(
        title="Jenny Concerts API",
        version="0.1.0",
        summary="Read and update concert data sourced from Apple Notes.",
        description=(
            "Backend API for serving the structured Concerts catalog and updating the underlying Apple Notes-backed data. "
            "Use the documented endpoints below to inspect the raw export, fetch the parsed catalog, refresh the source files, "
            "or update the Concerts note in controlled ways."
        ),
    )
    app.state.concerts_service = service or ConcertsService.for_project()

    # CORS: allow the deployed frontend origin (and local dev) to hit the API.
    # ALLOWED_ORIGINS accepts a comma-separated list of full origins, e.g.
    # "https://jennyconcerts.pages.dev,https://jennyconcerts.com".
    raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    @app.get("/health", tags=["system"], summary="Health check", description="Lightweight health check for local backend testing.")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(
        "/api/concerts/catalog",
        response_model=ConcertsCatalogResponse,
        tags=["concerts"],
        summary="Get the structured concerts catalog",
        description="Returns the cached website-friendly catalog. This endpoint never calls OpenAI.",
        response_description="Structured concerts catalog ready for frontend consumption.",
    )
    def get_catalog(service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(service.get_catalog)

    @app.get(
        "/api/concerts/source",
        response_model=NotesRawExportResponse,
        tags=["concerts"],
        summary="Get the raw exported Concerts note",
        description="Returns the raw Concerts note export including HTML and normalized body text.",
        response_description="Raw Concerts note export.",
    )
    def get_source(service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(service.get_raw_export)

    @app.get(
        "/api/concerts/media",
        tags=["concerts"],
        summary="Get the live concert media manifest",
        description="Returns artist and venue media records, including images resolved after recent note edits.",
    )
    def get_media(service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(service.get_media_manifest)

    @app.put(
        "/api/concerts/media/artist",
        tags=["concerts"],
        summary="Set a custom artist image URL",
        description="Stores a manual artist image override in the live media manifest.",
        dependencies=[Depends(require_admin)],
    )
    def set_artist_image(payload: ArtistImageRequest, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(lambda: service.set_artist_image(payload.artist, str(payload.imageUrl)))

    @app.get(
        "/api/concerts/uploads",
        response_model=ConcertUploadList,
        tags=["concerts"],
        summary="Browse concert photos and videos",
    )
    def list_uploads(
        artist: Optional[str] = None,
        date: Optional[str] = None,
        service: ConcertsService = Depends(get_concerts_service),
    ) -> dict:
        return service_call(lambda: service.list_uploads(artist=artist, date=date))

    @app.post(
        "/api/concerts/uploads",
        response_model=ConcertUpload,
        tags=["concerts"],
        summary="Upload a concert photo or video",
        description="Stores website-only concert media tagged with an artist and concert date.",
        dependencies=[Depends(require_admin)],
    )
    async def upload_concert_media(
        request: Request,
        service: ConcertsService = Depends(get_concerts_service),
    ) -> dict:
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/form-data"):
            form = await request.form()
            artist = str(form.get("artist") or "").strip()
            date = str(form.get("date") or "").strip()
            file = form.get("file")
            if not artist or not date or not file or not hasattr(file, "file"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload requires artist, date, and file fields.")
            if any(character in artist + date for character in "\r\n"):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Artist and date are required one-line values.")
            try:
                return service_call(lambda: service.save_upload(
                    artist,
                    date,
                    file.filename or "upload",
                    file.content_type or "application/octet-stream",
                    file.file,
                ))
            finally:
                file.file.close()

        return await upload_concert_media_raw(
            request=request,
            x_concert_artist=request.headers.get("x-concert-artist", ""),
            x_concert_date=request.headers.get("x-concert-date", ""),
            x_concert_filename=request.headers.get("x-concert-filename", "upload"),
            x_concert_mime_type=request.headers.get("x-concert-mime-type"),
            service=service,
        )

    @app.post(
        "/api/concerts/uploads/raw",
        response_model=ConcertUpload,
        tags=["concerts"],
        summary="Upload a concert photo or video with a raw file body",
        description="Website upload path that avoids multipart parsing issues by sending one raw file with metadata in headers.",
        dependencies=[Depends(require_admin)],
    )
    async def upload_concert_media_raw(
        request: Request,
        x_concert_artist: str = Header(...),
        x_concert_date: str = Header(...),
        x_concert_filename: str = Header(...),
        x_concert_mime_type: Optional[str] = Header(default=None),
        service: ConcertsService = Depends(get_concerts_service),
    ) -> dict:
        artist = x_concert_artist.strip()
        date = x_concert_date.strip()
        if not artist or not date or any(character in artist + date for character in "\r\n"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Artist and date are required one-line values.")

        spool = SpooledTemporaryFile(max_size=8 * 1024 * 1024)
        try:
            async for chunk in request.stream():
                spool.write(chunk)
            spool.seek(0)
            return service_call(lambda: service.save_upload(
                artist,
                date,
                x_concert_filename,
                x_concert_mime_type or request.headers.get("content-type") or "application/octet-stream",
                spool,
            ))
        finally:
            spool.close()

    @app.get(
        "/api/concerts/uploads/{media_id}/file",
        tags=["concerts"],
        summary="Read an uploaded concert media file",
    )
    def read_concert_media(media_id: str, service: ConcertsService = Depends(get_concerts_service)):
        item, path = service_call(lambda: service.get_upload_file(media_id))
        return FileResponse(path, media_type=item["mimeType"], filename=item["originalName"], content_disposition_type="inline")

    @app.delete(
        "/api/concerts/uploads/{media_id}",
        tags=["concerts"],
        summary="Delete an uploaded concert media file",
        dependencies=[Depends(require_admin)],
    )
    def delete_concert_media(media_id: str, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(lambda: service.delete_upload(media_id))

    @app.post(
        "/api/concerts/refresh",
        response_model=ConcertsCatalogResponse,
        tags=["concerts"],
        summary="Refresh the Concerts export and catalog",
        description=(
            "Re-reads the live Concerts note and rebuilds the deterministic catalog. "
            "OpenAI reviews only new or changed entries; unchanged entries are reused from the enrichment cache."
        ),
        response_description="Freshly rebuilt concerts catalog.",
        dependencies=[Depends(require_admin)],
    )
    def refresh_catalog(enrich: bool = True, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        return service_call(lambda: service.refresh_catalog(enrich=enrich))

    @app.patch(
        "/api/concerts/note/append",
        response_model=MutationResponse,
        tags=["concerts"],
        summary="Append a line to the Concerts note",
        description="Appends a line to the Concerts note, then regenerates the raw export and structured catalog.",
        response_description="Mutation result and refreshed catalog.",
        dependencies=[Depends(require_admin)],
    )
    def append_line(payload: AppendLineRequest, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        catalog = service_call(lambda: service.append_line(payload.line))
        return {
            "action": "append_line",
            "detail": f"Appended line to Concerts note: {payload.line}",
            "catalog": catalog,
        }

    @app.post(
        "/api/concerts/note/entries",
        response_model=MutationResponse,
        tags=["concerts"],
        summary="Add an entry to a Concerts note section",
        description="Adds one validated entry to the requested section, then regenerates the export and catalog.",
        response_description="Mutation result and refreshed catalog.",
        dependencies=[Depends(require_admin)],
    )
    def create_entry(payload: ConcertEntryMutationRequest, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        catalog = service_call(lambda: service.create_entry(payload.section.value, payload.raw, payload.expectedModifiedAt))
        return {
            "action": "create_entry",
            "detail": f"Added entry to {payload.section.value}.",
            "catalog": catalog,
        }

    @app.patch(
        "/api/concerts/note/entries",
        response_model=MutationResponse,
        tags=["concerts"],
        summary="Update one existing Concerts note entry",
        description="Replaces exactly one matching entry within its current section. This endpoint cannot delete entries.",
        response_description="Mutation result and refreshed catalog.",
        dependencies=[Depends(require_admin)],
    )
    def update_entry(payload: UpdateConcertEntryRequest, service: ConcertsService = Depends(get_concerts_service)) -> dict:
        catalog = service_call(lambda: service.update_entry(
            payload.section.value,
            payload.originalRaw,
            payload.raw,
            payload.expectedModifiedAt,
        ))
        return {
            "action": "update_entry",
            "detail": f"Updated entry in {payload.section.value}.",
            "catalog": catalog,
        }

    return app


app = create_app()
