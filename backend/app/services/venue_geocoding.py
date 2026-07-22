"""Venue geocoding via OpenStreetMap Nominatim.

Free service, no API key required. Usage policy: include a descriptive
User-Agent, do not exceed 1 request per second, cache aggressively.

We only geocode a venue once. The result is stored in venue-details.json
and reused on every subsequent read.
"""
from __future__ import annotations

import json
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

_USER_AGENT = "JennyConcertWebsite/1.0 (personal concert journal; venue geocoding)"
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_MIN_INTERVAL_SECONDS = 1.05  # Nominatim's ToS caps at 1 req/sec; add slack.

_last_request_at = 0.0
_last_request_lock = threading.Lock()


class VenueGeocodingError(RuntimeError):
    """Raised when the geocoder call itself fails (network, parse, etc.)."""


def normalize_venue_key(value: str) -> str:
    """Return the same normalization the frontend uses so keys match."""
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    without_marks = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", without_marks.lower().replace("&", " and ")).strip()


def _throttle() -> None:
    """Block until at least _MIN_INTERVAL_SECONDS has passed since the last call."""
    global _last_request_at
    with _last_request_lock:
        now = time.monotonic()
        elapsed = now - _last_request_at
        if elapsed < _MIN_INTERVAL_SECONDS:
            time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
        _last_request_at = time.monotonic()


def _infer_venue_type(nominatim_result: Dict[str, Any]) -> Optional[str]:
    """Map Nominatim's classification onto our editorial venue types.

    Nominatim returns 'class' + 'type' fields (e.g. class=amenity, type=theatre).
    We map the useful cases and return None otherwise so the frontend uses its
    generic 'Venue' label.
    """
    class_ = (nominatim_result.get("class") or "").lower()
    type_ = (nominatim_result.get("type") or "").lower()

    # Well-known mappings.
    if type_ in {"stadium"}:
        return "stadium"
    if type_ in {"arena"}:
        return "arena"
    if type_ in {"amphitheatre", "amphitheater"}:
        return "amphitheatre"
    if type_ in {"theatre", "theater"}:
        return "theater"
    if type_ in {"nightclub"}:
        return "club"
    if type_ in {"cemetery", "grave_yard"}:
        return "cemetery"
    if type_ in {"studio"}:
        return "studio"

    # Fallbacks by class.
    if class_ == "leisure":
        return "amphitheatre" if type_ == "park" else None
    if class_ == "amenity" and type_ in {"community_centre", "conference_centre"}:
        return "ballroom"
    return None


def _extract_city(address: Dict[str, str]) -> Optional[str]:
    """Compose 'City, ST' from Nominatim's address hash. US-biased."""
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("hamlet")
    )
    state = address.get("state") or ""
    country_code = (address.get("country_code") or "").upper()
    if not city:
        return None
    # For US results, use state postal abbreviation when Nominatim gives us full state name.
    us_state_abbrev = {
        "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
        "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
        "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
        "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
        "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
        "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
        "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
        "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
        "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
        "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
        "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
        "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
        "Wisconsin": "WI", "Wyoming": "WY",
    }
    if country_code == "US":
        state = us_state_abbrev.get(state, state)
    return f"{city}, {state}".strip(", ")


def _extract_neighborhood(address: Dict[str, str]) -> Optional[str]:
    """Pick the most specific sub-city label available."""
    return (
        address.get("neighbourhood")
        or address.get("suburb")
        or address.get("borough")
        or address.get("quarter")
        or address.get("city_district")
    )


def geocode_venue(name: str, city_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Look up a venue by name (and optional city hint). Returns a dict or None.

    The returned dict has the same shape as our curated venue records:
    {name, city, neighborhood, venueType, lat, lng, verified, source}.
    Never raises for a not-found; returns None instead.
    Raises VenueGeocodingError only on transport failures.
    """
    if not name or not name.strip():
        return None

    query = name.strip()
    if city_hint:
        query = f"{query}, {city_hint.strip()}"

    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": "1",
        "limit": "1",
        "countrycodes": "us,ca,mx,gb,fr,de,it,es,jp,au",  # bias to common concert countries
    }
    url = f"{_NOMINATIM_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    })

    _throttle()
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.request.HTTPError, urllib.request.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise VenueGeocodingError(f"Nominatim lookup failed for {name!r}: {exc}") from exc

    if not payload:
        return None

    top = payload[0]
    try:
        lat = float(top.get("lat"))
        lng = float(top.get("lon"))
    except (TypeError, ValueError):
        return None

    address = top.get("address") or {}
    city = _extract_city(address) or (city_hint if city_hint else None)
    neighborhood = _extract_neighborhood(address)
    venue_type = _infer_venue_type(top)

    return {
        "name": name.strip(),
        "city": city,
        "neighborhood": neighborhood,
        "venueType": venue_type,
        "lat": lat,
        "lng": lng,
        "verified": False,
        "source": "nominatim",
    }
