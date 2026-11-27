"""
StellarCore Public GET API Client (Python Standard Library)

Provides dependency-free access to read-only public endpoints:
- Anchors Directory: GET /api/anchors, GET /api/anchors/{slug}
- Corridors Directory: GET /api/corridors, GET /api/corridors/{slug}
- Indicative Rates: GET /api/rates?corridor={slug}
- Rate History: GET /api/rates/history?corridor={slug}&days={days}
- Public Reputation: GET /api/reputation, GET /api/reputation/{slug}

Notice: All results from StellarCore are read-only, indicative, and for
market observation only. They are NOT executable transfer quotes or guarantees
of operational availability.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple


class StellarCoreApiError(Exception):
    """Raised when the StellarCore API returns an HTTP error status."""

    def __init__(self, status_code: int, code: str, message: str, raw_body: str = ""):
        super().__init__(f"StellarCore API error ({status_code} - {code}): {message}")
        self.status_code = status_code
        self.code = code
        self.api_message = message
        self.raw_body = raw_body


class StellarCoreNetworkError(Exception):
    """Raised when a network or timeout error occurs communicating with the API."""


class StellarCoreResponseError(Exception):
    """Raised when the API returns an unexpected or unparseable response shape."""


class StellarCoreClient:
    """Dependency-free HTTP client for the StellarCore public read-only GET APIs."""

    def __init__(self, base_url: str = "http://localhost:3000", timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], Dict[str, str]]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            clean_params = {k: v for k, v in params.items() if v is not None}
            if clean_params:
                query_string = urllib.parse.urlencode(clean_params)
                url = f"{url}?{query_string}"

        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "StellarCore-Python-Example/1.0",
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                status = response.status
                headers = {key.lower(): value for key, value in response.headers.items()}
                if status != 200:
                    raise StellarCoreApiError(status, "unexpected_status", "Expected HTTP 200.")
                raw_bytes = response.read()
                raw_text = raw_bytes.decode("utf-8", errors="replace")

                try:
                    data = json.loads(raw_text)
                except json.JSONDecodeError as err:
                    raise StellarCoreResponseError(
                        f"Failed to decode JSON from {url}: {err}. Body: {raw_text[:200]}"
                    ) from err

                if not isinstance(data, dict):
                    raise StellarCoreResponseError(
                        f"Expected JSON object response from {url}, got {type(data).__name__}"
                    )

                return data, headers

        except urllib.error.HTTPError as err:
            raw_err_bytes = err.read()
            raw_err_text = raw_err_bytes.decode("utf-8", errors="replace")
            err_code = "http_error"
            err_message = f"HTTP request failed with status {err.code}"

            try:
                err_data = json.loads(raw_err_text)
                if isinstance(err_data, dict) and "error" in err_data:
                    err_obj = err_data["error"]
                    err_code = str(err_obj.get("code", err_code))
                    err_message = str(err_obj.get("message", err_message))
            except Exception:
                pass

            raise StellarCoreApiError(
                status_code=err.code,
                code=err_code,
                message=err_message,
                raw_body=raw_err_text,
            ) from err

        except urllib.error.URLError as err:
            raise StellarCoreNetworkError(f"Network error connecting to {url}: {err.reason}") from err
        except TimeoutError as err:
            raise StellarCoreNetworkError(f"Request timed out connecting to {url}") from err

    def list_anchors(self, limit: Optional[int] = None, offset: Optional[int] = None) -> Dict[str, Any]:
        """Lists anchors from the public directory: GET /api/anchors."""
        params = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        data, _ = self._get("/api/anchors", params)
        return data

    def get_anchor(self, slug: str) -> Dict[str, Any]:
        """Gets single anchor details: GET /api/anchors/{slug}."""
        safe_slug = urllib.parse.quote(slug, safe="")
        data, _ = self._get(f"/api/anchors/{safe_slug}")
        return data

    def list_corridors(self, limit: Optional[int] = None, offset: Optional[int] = None) -> Dict[str, Any]:
        """Lists corridors from the public directory: GET /api/corridors."""
        params = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        data, _ = self._get("/api/corridors", params)
        return data

    def get_corridor(self, slug: str) -> Dict[str, Any]:
        """Gets single corridor details: GET /api/corridors/{slug}."""
        safe_slug = urllib.parse.quote(slug, safe="")
        data, _ = self._get(f"/api/corridors/{safe_slug}")
        return data

    def get_corridor_rate(self, corridor_slug: str) -> Dict[str, Any]:
        """
        Reads indicative median rate and fresh observation evidence:
        GET /api/rates?corridor={corridor_slug}.

        Crucial: medianRate may be null if there are insufficient fresh
        sources. Do not coerce null values to 0.0.
        """
        data, headers = self._get("/api/rates", {"corridor": corridor_slug})
        evidence_state = headers.get("x-evidence-state")
        if evidence_state:
            data["_evidence_state_header"] = evidence_state
        return data

    def get_rate_history(self, corridor_slug: str, days: int = 30) -> Dict[str, Any]:
        """
        Reads historical rate observations:
        GET /api/rates/history?corridor={corridor_slug}&days={days}.
        """
        data, headers = self._get("/api/rates/history", {"corridor": corridor_slug, "days": days})
        if headers.get("x-evidence-state"):
            data["_evidence_state_header"] = headers["x-evidence-state"]
        return data

    def get_anchor_reputation(self, anchor_slug: str) -> Dict[str, Any]:
        """
        Reads public reputation score and components:
        GET /api/reputation/{anchor_slug}.

        Crucial: score may be null if evidence is insufficient or unavailable.
        """
        safe_slug = urllib.parse.quote(anchor_slug, safe="")
        data, headers = self._get(f"/api/reputation/{safe_slug}")
        if headers.get("x-evidence-state"):
            data["_evidence_state_header"] = headers["x-evidence-state"]
        return data


# Alias for convenience
StellarCoreApiClient = StellarCoreClient

