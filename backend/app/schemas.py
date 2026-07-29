from __future__ import annotations

from enum import Enum
from typing import Any, List, Optional

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator, model_validator


class ParsedMetadata(BaseModel):
    date: Optional[str] = Field(default=None, description="Normalized date value when available.")
    venue: Optional[str] = Field(default=None, description="Normalized venue value when available.")
    city: Optional[str] = Field(default=None, description="Normalized city value when available.")


class EntryEnrichment(BaseModel):
    confidence: float = Field(description="Model confidence from zero to one.")
    needsReview: bool = Field(description="Whether the cleaned entry should be reviewed by a person.")
    changes: List[str] = Field(default_factory=list, description="Summary of meaningful cleanup performed.")
    resolvedBy: str = Field(description="Resolver that produced this enrichment, such as openai or deterministic.")
    model: Optional[str] = Field(default=None, description="OpenAI model used for this entry when applicable.")
    resolvedAt: str = Field(description="Timestamp when this entry was resolved.")


class ConcertEntry(BaseModel):
    index: int = Field(description="Stable index within the section as parsed from the source note.")
    raw: str = Field(description="Original line content from the source note.")
    artist: str = Field(description="Best-effort artist or headline value extracted from the raw line.")
    status: str = Field(description="Catalog status such as want_to_see or seen.")
    rating: Optional[str] = Field(default=None, description="Normalized reaction rating derived from emoji markers.")
    notes: Optional[str] = Field(default=None, description="Freeform trailing note text captured from parentheses when present.")
    dateText: Optional[str] = Field(default=None, description="Best-effort date fragment extracted from note metadata.")
    locationText: Optional[str] = Field(default=None, description="Best-effort location or venue fragment extracted from note metadata.")
    parsed: ParsedMetadata
    artistKey: Optional[str] = Field(default=None, description="Stable URL-friendly key derived from the cleaned artist name.")
    enrichment: Optional[EntryEnrichment] = Field(default=None, description="Provenance and confidence for LLM-assisted cleanup.")


class ParsedCatalog(BaseModel):
    wantToSee: List[ConcertEntry] = Field(default_factory=list)
    haveSeen: List[ConcertEntry] = Field(default_factory=list)
    futureConcerts: List[ConcertEntry] = Field(default_factory=list)


class SourceMetadata(BaseModel):
    noteId: str
    title: str
    account: str
    folder: str
    createdAt: str
    modifiedAt: str
    exportedAt: Optional[str] = None


class RawExport(BaseModel):
    bodyHtml: str
    bodyText: str


class CatalogEnrichmentMetadata(BaseModel):
    status: str = Field(description="Enrichment status, normally complete or disabled.")
    sourceHash: str = Field(description="SHA-256 hash of the deterministic parsed catalog.")
    model: Optional[str] = Field(default=None, description="OpenAI model configured for cleanup.")
    resolverVersion: int
    reviewedAt: str
    lastCheckedAt: str
    totalEntries: int
    llmReviewedEntries: int = Field(description="Entries sent to OpenAI during the most recent refresh.")
    cacheHits: int = Field(description="Entries reused from the durable enrichment cache.")
    needsReview: int = Field(description="Entries currently flagged for human review.")


class ConcertsCatalogResponse(BaseModel):
    schemaVersion: int
    source: SourceMetadata
    rawExport: RawExport
    parsedCatalog: ParsedCatalog
    enrichment: Optional[CatalogEnrichmentMetadata] = None


class NotesRawExportResponse(BaseModel):
    source: str
    noteCount: int
    notes: List[dict[str, Any]]
    exportedAt: Optional[str] = None


class AppendLineRequest(BaseModel):
    line: str = Field(..., min_length=1, description="Line to append to the Concerts note body.", examples=["SMOKE_TEST_CONCERTS_001"])


class ConcertSection(str, Enum):
    want_to_see = "wantToSee"
    have_seen = "haveSeen"
    future_concerts = "futureConcerts"


class ConcertEntryMutationRequest(BaseModel):
    section: ConcertSection = Field(description="Concerts note section containing the entry.")
    raw: str = Field(..., min_length=1, max_length=500, description="Complete one-line entry to store in Apple Notes.")
    expectedModifiedAt: str = Field(..., min_length=1, description="Notes modification timestamp loaded by the client.")

    @field_validator("raw")
    @classmethod
    def validate_raw_entry(cls, value: str) -> str:
        normalized = value.strip()
        if "\n" in normalized or "\r" in normalized:
            raise ValueError("Concert entries must contain exactly one line.")
        if normalized.casefold() in {"want to see", "have seen", "future concerts"}:
            raise ValueError("Concert entries cannot use a section heading.")
        return normalized


class UpdateConcertEntryRequest(ConcertEntryMutationRequest):
    originalRaw: str = Field(..., min_length=1, max_length=500, description="Exact current entry text used for safe in-place matching.")

    @field_validator("originalRaw")
    @classmethod
    def validate_original_raw(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or "\n" in normalized or "\r" in normalized:
            raise ValueError("Original concert entry must contain exactly one non-empty line.")
        return normalized

    @model_validator(mode="after")
    def require_a_change(self):
        if self.raw == self.originalRaw:
            raise ValueError("The updated concert entry must be different from the original.")
        return self


class ArtistImageRequest(BaseModel):
    artist: str = Field(..., min_length=1, max_length=200, description="Artist name that should use the image override.")
    imageUrl: AnyHttpUrl = Field(description="Direct HTTP or HTTPS URL for the artist image.")

    @field_validator("artist")
    @classmethod
    def validate_artist(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or "\n" in normalized or "\r" in normalized:
            raise ValueError("Artist must contain exactly one non-empty line.")
        return normalized


class ConcertUpload(BaseModel):
    id: str
    artist: str
    date: str
    originalName: str
    mediaType: str
    mimeType: str
    size: int
    uploadedAt: str
    url: str


class ConcertUploadList(BaseModel):
    items: List[ConcertUpload] = Field(default_factory=list)


class MutationResponse(BaseModel):
    action: str = Field(description="Mutation action that was performed.")
    detail: str = Field(description="Human-readable description of the mutation result.")
    catalog: ConcertsCatalogResponse


class PublishNotesRequest(BaseModel):
    bodyText: str = Field(..., min_length=1, description="Full plain-text body of the Concerts note.")
    title: str = Field(default="Concerts", min_length=1, max_length=200, description="Note title as seen in Apple Notes.")
    noteId: Optional[str] = Field(default=None, max_length=500, description="Optional stable note identifier from the publishing device.")
    account: Optional[str] = Field(default=None, max_length=200, description="Optional source account name, for example iCloud.")
    folder: Optional[str] = Field(default=None, max_length=200, description="Optional source folder name.")
    modifiedAt: Optional[str] = Field(default=None, max_length=100, description="Optional note-modified timestamp from the publishing device.")
    sourceDevice: Optional[str] = Field(default=None, max_length=200, description="Optional human-readable device name, for example Jenny's iPhone.")

    @field_validator("bodyText", "title", mode="before")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized


class PublishNotesResponse(BaseModel):
    action: str = Field(default="publish_notes")
    detail: str = Field(description="Human-readable publish result.")
    publishedAt: str = Field(description="Server timestamp when the note was published.")
    sourceDevice: Optional[str] = Field(default=None, description="Device name provided by the publisher, when available.")
    catalog: ConcertsCatalogResponse
