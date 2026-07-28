from __future__ import annotations

import os
from tempfile import SpooledTemporaryFile
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .schemas import (
    ArtistImageRequest,
    ConcertUpload,
    ConcertUploadList,
    ConcertsCatalogResponse,
)
from .services.concerts import ConcertsConflictError, ConcertsService, ConcertsServiceError, ConcertUploadError


def get_concerts_service(request: Request) -> ConcertsService:
    return request.app.state.concerts_service

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

    return app


app = create_app()
