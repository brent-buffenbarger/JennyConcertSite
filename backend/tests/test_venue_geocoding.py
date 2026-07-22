"""Tests for the venue geocoding module.

We don't hit Nominatim from tests. Instead we validate the pure helpers
(normalize_venue_key, _infer_venue_type, _extract_city, _extract_neighborhood)
and the geocode_venue function with a stubbed HTTP layer.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from app.services import venue_geocoding


def test_normalize_venue_key_lowercases_and_strips_punctuation() -> None:
    assert venue_geocoding.normalize_venue_key("The Fonda Theatre") == "the fonda theatre"
    assert venue_geocoding.normalize_venue_key("SoFi Stadium!") == "sofi stadium"
    assert venue_geocoding.normalize_venue_key("Rock & Roll Hall") == "rock and roll hall"


def test_normalize_venue_key_handles_empty_and_none() -> None:
    assert venue_geocoding.normalize_venue_key("") == ""
    assert venue_geocoding.normalize_venue_key(None) == ""  # type: ignore[arg-type]


def test_normalize_venue_key_strips_diacritics() -> None:
    assert venue_geocoding.normalize_venue_key("Café Wha?") == "cafe wha"


def test_infer_venue_type_maps_common_types() -> None:
    assert venue_geocoding._infer_venue_type({"class": "amenity", "type": "theatre"}) == "theater"
    assert venue_geocoding._infer_venue_type({"class": "leisure", "type": "stadium"}) == "stadium"
    assert venue_geocoding._infer_venue_type({"class": "leisure", "type": "nightclub"}) == "club"
    assert venue_geocoding._infer_venue_type({"class": "amenity", "type": "grave_yard"}) == "cemetery"


def test_infer_venue_type_returns_none_for_unknown() -> None:
    assert venue_geocoding._infer_venue_type({"class": "highway", "type": "residential"}) is None
    assert venue_geocoding._infer_venue_type({}) is None


def test_extract_city_prefers_city_and_uses_us_state_abbreviations() -> None:
    address = {"city": "Los Angeles", "state": "California", "country_code": "us"}
    assert venue_geocoding._extract_city(address) == "Los Angeles, CA"


def test_extract_city_falls_back_to_town_when_no_city() -> None:
    address = {"town": "Maryland Heights", "state": "Missouri", "country_code": "us"}
    assert venue_geocoding._extract_city(address) == "Maryland Heights, MO"


def test_extract_city_leaves_non_us_state_names_intact() -> None:
    address = {"city": "London", "state": "England", "country_code": "gb"}
    assert venue_geocoding._extract_city(address) == "London, England"


def test_extract_city_returns_none_without_locality() -> None:
    assert venue_geocoding._extract_city({"state": "California"}) is None


def test_extract_neighborhood_prefers_most_specific_field() -> None:
    address = {"neighbourhood": "Echo Park", "suburb": "Central LA"}
    assert venue_geocoding._extract_neighborhood(address) == "Echo Park"
    assert venue_geocoding._extract_neighborhood({"suburb": "Hollywood"}) == "Hollywood"
    assert venue_geocoding._extract_neighborhood({}) is None


@pytest.fixture(autouse=True)
def _reset_throttle():
    """Reset the module-level throttle timer between tests so we don't sleep."""
    venue_geocoding._last_request_at = 0.0
    yield
    venue_geocoding._last_request_at = 0.0


def _mock_urlopen(payload):
    """Build a context-manager-style stand-in for urllib.request.urlopen."""
    class FakeResponse:
        def __init__(self, body: bytes) -> None:
            self._body = body

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    return lambda *args, **kwargs: FakeResponse(json.dumps(payload).encode("utf-8"))


def test_geocode_venue_returns_structured_result_for_known_venue() -> None:
    fake_payload = [{
        "lat": "34.0982",
        "lon": "-118.3252",
        "class": "amenity",
        "type": "theatre",
        "address": {
            "city": "Los Angeles",
            "state": "California",
            "country_code": "us",
            "neighbourhood": "Hollywood",
        },
    }]
    # Patch sleep to a no-op so throttle doesn't slow the test suite down.
    with patch("app.services.venue_geocoding.urllib.request.urlopen", _mock_urlopen(fake_payload)), \
         patch("app.services.venue_geocoding.time.sleep"):
        result = venue_geocoding.geocode_venue("Hollywood Palladium")

    assert result is not None
    assert result["name"] == "Hollywood Palladium"
    assert result["lat"] == pytest.approx(34.0982)
    assert result["lng"] == pytest.approx(-118.3252)
    assert result["city"] == "Los Angeles, CA"
    assert result["neighborhood"] == "Hollywood"
    assert result["venueType"] == "theater"
    assert result["verified"] is False
    assert result["source"] == "nominatim"


def test_geocode_venue_returns_none_when_no_results() -> None:
    with patch("app.services.venue_geocoding.urllib.request.urlopen", _mock_urlopen([])):
        assert venue_geocoding.geocode_venue("Totally Made Up Venue That Does Not Exist") is None


def test_geocode_venue_returns_none_when_result_has_no_coords() -> None:
    fake_payload = [{"lat": None, "lon": None, "type": "unknown", "address": {}}]
    with patch("app.services.venue_geocoding.urllib.request.urlopen", _mock_urlopen(fake_payload)):
        assert venue_geocoding.geocode_venue("Weird Result") is None


def test_geocode_venue_raises_on_network_error() -> None:
    def _raise(*args, **kwargs):
        raise TimeoutError("boom")

    with patch("app.services.venue_geocoding.urllib.request.urlopen", _raise):
        with pytest.raises(venue_geocoding.VenueGeocodingError):
            venue_geocoding.geocode_venue("Anywhere")


def test_geocode_venue_returns_none_for_empty_input() -> None:
    assert venue_geocoding.geocode_venue("") is None
    assert venue_geocoding.geocode_venue("   ") is None
