"""
Offline Unit Tests for StellarCore Python Public API Client

Runs completely offline with unittest.mock; no live network or credentials needed.
"""

from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from client import (
    StellarCoreClient,
    StellarCoreApiError,
    StellarCoreNetworkError,
    StellarCoreResponseError,
)


def make_mock_response(status: int, body_dict: dict, headers: dict | None = None) -> MagicMock:
    body_bytes = json.dumps(body_dict).encode("utf-8")
    mock = MagicMock()
    mock.status = status
    mock.headers = headers or {"Content-Type": "application/json"}
    mock.read.return_value = body_bytes
    mock.__enter__.return_value = mock
    mock.__exit__.return_value = None
    return mock


def make_mock_http_error(status: int, body_dict: dict, url: str = "http://localhost:3000/api") -> urllib.error.HTTPError:
    body_bytes = json.dumps(body_dict).encode("utf-8")
    fp = io.BytesIO(body_bytes)
    return urllib.error.HTTPError(
        url=url,
        code=status,
        msg=f"HTTP {status}",
        hdrs=MagicMock(),
        fp=fp,
    )


class TestStellarCoreClient(unittest.TestCase):
    def setUp(self):
        self.client = StellarCoreClient(base_url="http://test-stellarcore.local:3000", timeout=5.0)

    @patch("urllib.request.urlopen")
    def test_list_anchors_success(self, mock_urlopen):
        fixture = {
            "anchors": [
                {
                    "slug": "cowrie",
                    "name": "Cowrie",
                    "homeDomain": "cowrie.exchange",
                    "status": "LIVE",
                    "seps": [1, 6],
                    "isTransferCapable": True,
                    "corridorCount": 1,
                }
            ],
            "count": 1,
        }
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.list_anchors(limit=10, offset=0)
        self.assertEqual(result["count"], 1)
        self.assertEqual(len(result["anchors"]), 1)
        self.assertEqual(result["anchors"][0]["slug"], "cowrie")

        # Verify URL called has encoded query parameters
        called_req = mock_urlopen.call_args[0][0]
        self.assertIn("limit=10", called_req.full_url)
        self.assertIn("offset=0", called_req.full_url)

    @patch("urllib.request.urlopen")
    def test_list_anchors_empty_directory(self, mock_urlopen):
        fixture = {"anchors": [], "count": 0}
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.list_anchors()
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["anchors"], [])

    @patch("urllib.request.urlopen")
    def test_list_corridors_success(self, mock_urlopen):
        fixture = {
            "corridors": [
                {
                    "slug": "usdc-ngn",
                    "sourceAsset": "USDC",
                    "sourceCountry": "US",
                    "destinationAsset": "NGN",
                    "destinationCountry": "NG",
                    "anchorCount": 2,
                }
            ],
            "count": 1,
        }
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.list_corridors()
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["corridors"][0]["slug"], "usdc-ngn")

    @patch("urllib.request.urlopen")
    def test_get_corridor_rate_with_published_median(self, mock_urlopen):
        fixture = {
            "corridor": {
                "slug": "usdc-us-brl-br",
                "sourceAsset": "USDC",
                "sourceCountry": "US",
                "destinationAsset": "BRL",
                "destinationCountry": "BR"
            },
            "evaluatedAt": "2026-08-28T12:00:00.000Z",
            "state": "healthy",
            "medianRate": "5.250000000000000000",
            "sourceCount": 2,
            "freshSourceCount": 2,
            "reviewedCandidateConfiguration": {
                "candidateCount": 1,
                "uniqueAnchorCount": 1
            },
            "medianRequirement": {
                "minimumFreshIndependentSources": 2
            },
            "observations": [
                {
                    "anchor": {
                        "slug": "cowrie",
                        "name": "Cowrie"
                    },
                    "rate": "5.240000000000000000",
                    "sourceAmount": "100.000000000000000000",
                    "destinationAmount": "524.000000000000000000",
                    "fee": "1.000000000000000000",
                    "capturedAt": "2026-08-28T11:59:50.000Z",
                    "freshness": {
                        "state": "fresh",
                        "ageMs": 10000
                    },
                    "eligibleForMedian": True
                },
                {
                    "anchor": {
                        "slug": "zeam",
                        "name": "Zeam"
                    },
                    "rate": "5.260000000000000000",
                    "sourceAmount": "100.000000000000000000",
                    "destinationAmount": "526.000000000000000000",
                    "fee": "1.500000000000000000",
                    "capturedAt": "2026-08-28T11:59:45.000Z",
                    "freshness": {
                        "state": "fresh",
                        "ageMs": 15000
                    },
                    "eligibleForMedian": True
                }
            ]
        }
        mock_urlopen.return_value = make_mock_response(
            200, fixture, headers={"Content-Type": "application/json", "X-Evidence-State": "stale"}
        )

        result = self.client.get_corridor_rate("usdc-ngn")
        self.assertEqual(result["medianRate"], "5.250000000000000000")
        self.assertEqual(result["state"], "healthy")
        self.assertEqual(result.get("_evidence_state_header"), "stale")
        self.assertEqual(result["medianRequirement"]["minimumFreshIndependentSources"], 2)
        self.assertEqual(result["observations"][0]["anchor"]["name"], "Cowrie")

    @patch("urllib.request.urlopen")
    def test_get_corridor_rate_with_null_median_insufficient_sources(self, mock_urlopen):
        fixture = {
            "corridor": {
                "slug": "usdc-us-brl-br",
                "sourceAsset": "USDC",
                "sourceCountry": "US",
                "destinationAsset": "BRL",
                "destinationCountry": "BR"
            },
            "evaluatedAt": "2026-08-28T12:00:00.000Z",
            "state": "insufficient_fresh_sources",
            "medianRate": None,
            "sourceCount": 0,
            "freshSourceCount": 0,
            "reviewedCandidateConfiguration": {
                "candidateCount": 1,
                "uniqueAnchorCount": 1
            },
            "medianRequirement": {
                "minimumFreshIndependentSources": 2
            },
            "observations": []
        }
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.get_corridor_rate("usdc-ngn")
        # Crucial: medianRate must remain None, not coerced to 0.0 or 0
        self.assertIsNone(result["medianRate"])
        self.assertEqual(result["state"], "insufficient_fresh_sources")

    @patch("urllib.request.urlopen")
    def test_get_rate_history_success(self, mock_urlopen):
        fixture = {
            "corridor": {
                "slug": "usdc-us-brl-br",
                "sourceAsset": "USDC",
                "sourceCountry": "US",
                "destinationAsset": "BRL",
                "destinationCountry": "BR"
            },
            "evaluatedAt": "2026-08-28T12:00:00.000Z",
            "windowDays": 7,
            "points": [
                {
                    "timestamp": "2026-08-27T00:00:00Z",
                    "medianRate": "5.250000000000000000",
                    "state": "healthy",
                    "sourceCount": 2,
                    "freshSourceCount": 2,
                    "observations": [
                        {
                            "anchor": {
                                "slug": "cowrie",
                                "name": "Cowrie"
                            },
                            "rate": "5.240000000000000000",
                            "sourceAmount": "100.000000000000000000",
                            "destinationAmount": "524.000000000000000000",
                            "fee": "1.000000000000000000",
                            "capturedAt": "2026-08-28T11:59:50.000Z"
                        },
                        {
                            "anchor": {
                                "slug": "zeam",
                                "name": "Zeam"
                            },
                            "rate": "5.260000000000000000",
                            "sourceAmount": "100.000000000000000000",
                            "destinationAmount": "526.000000000000000000",
                            "fee": "1.500000000000000000",
                            "capturedAt": "2026-08-28T11:59:45.000Z"
                        }
                    ]
                },
                {
                    "timestamp": "2026-08-28T00:00:00Z",
                    "medianRate": None,
                    "state": "insufficient_fresh_sources",
                    "sourceCount": 0,
                    "freshSourceCount": 0,
                    "observations": []
                }
            ]
        }
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.get_rate_history("usdc-ngn", days=7)
        self.assertEqual(len(result["points"]), 2)
        self.assertIsNone(result["points"][1]["medianRate"])

        called_req = mock_urlopen.call_args[0][0]
        self.assertIn("days=7", called_req.full_url)
        self.assertIn("corridor=usdc-ngn", called_req.full_url)

    @patch("urllib.request.urlopen")
    def test_get_anchor_reputation_with_null_score(self, mock_urlopen):
        fixture = {
            "reputation": {
                "anchor": {
                    "slug": "zeam",
                    "name": "Zeam"
                },
                "state": "not_evaluated",
                "score": None,
                "scoreBand": None,
                "evidence": None,
                "metrics": None,
                "computedAt": None
            }
        }
        mock_urlopen.return_value = make_mock_response(200, fixture)

        result = self.client.get_anchor_reputation("new-anchor")
        # Crucial: score must remain None, not coerced to 0
        self.assertIsNone(result["reputation"]["score"])
        self.assertEqual(result["reputation"]["state"], "not_evaluated")

    @patch("urllib.request.urlopen")
    def test_rate_cli_reads_contract_fields(self, mock_urlopen):
        import contextlib
        import read_corridor_rates
        rate = {
            "corridor": {
                "slug": "usdc-us-brl-br",
                "sourceAsset": "USDC",
                "sourceCountry": "US",
                "destinationAsset": "BRL",
                "destinationCountry": "BR"
            },
            "evaluatedAt": "2026-08-28T12:00:00.000Z",
            "state": "healthy",
            "medianRate": "5.250000000000000000",
            "sourceCount": 2,
            "freshSourceCount": 2,
            "reviewedCandidateConfiguration": {
                "candidateCount": 1,
                "uniqueAnchorCount": 1
            },
            "medianRequirement": {
                "minimumFreshIndependentSources": 2
            },
            "observations": [
                {
                    "anchor": {
                        "slug": "cowrie",
                        "name": "Cowrie"
                    },
                    "rate": "5.240000000000000000",
                    "sourceAmount": "100.000000000000000000",
                    "destinationAmount": "524.000000000000000000",
                    "fee": "1.000000000000000000",
                    "capturedAt": "2026-08-28T11:59:50.000Z",
                    "freshness": {
                        "state": "fresh",
                        "ageMs": 10000
                    },
                    "eligibleForMedian": True
                },
                {
                    "anchor": {
                        "slug": "zeam",
                        "name": "Zeam"
                    },
                    "rate": "5.260000000000000000",
                    "sourceAmount": "100.000000000000000000",
                    "destinationAmount": "526.000000000000000000",
                    "fee": "1.500000000000000000",
                    "capturedAt": "2026-08-28T11:59:45.000Z",
                    "freshness": {
                        "state": "fresh",
                        "ageMs": 15000
                    },
                    "eligibleForMedian": True
                }
            ]
        }
        history = {
            "corridor": {
                "slug": "usdc-us-brl-br",
                "sourceAsset": "USDC",
                "sourceCountry": "US",
                "destinationAsset": "BRL",
                "destinationCountry": "BR"
            },
            "evaluatedAt": "2026-08-28T12:00:00.000Z",
            "windowDays": 7,
            "points": [
                {
                    "timestamp": "2026-08-27T00:00:00Z",
                    "medianRate": "5.250000000000000000",
                    "state": "healthy",
                    "sourceCount": 2,
                    "freshSourceCount": 2,
                    "observations": [
                        {
                            "anchor": {
                                "slug": "cowrie",
                                "name": "Cowrie"
                            },
                            "rate": "5.240000000000000000",
                            "sourceAmount": "100.000000000000000000",
                            "destinationAmount": "524.000000000000000000",
                            "fee": "1.000000000000000000",
                            "capturedAt": "2026-08-28T11:59:50.000Z"
                        },
                        {
                            "anchor": {
                                "slug": "zeam",
                                "name": "Zeam"
                            },
                            "rate": "5.260000000000000000",
                            "sourceAmount": "100.000000000000000000",
                            "destinationAmount": "526.000000000000000000",
                            "fee": "1.500000000000000000",
                            "capturedAt": "2026-08-28T11:59:45.000Z"
                        }
                    ]
                },
                {
                    "timestamp": "2026-08-28T00:00:00Z",
                    "medianRate": None,
                    "state": "insufficient_fresh_sources",
                    "sourceCount": 0,
                    "freshSourceCount": 0,
                    "observations": []
                }
            ]
        }
        mock_urlopen.side_effect = [make_mock_response(200, rate), make_mock_response(200, history)]
        output = io.StringIO()
        with patch("sys.argv", ["read_corridor_rates.py", "usdc-us-brl-br"]), contextlib.redirect_stdout(output):
            read_corridor_rates.main()
        self.assertIn("Minimum Required: 2", output.getvalue())
        self.assertIn("Cowrie", output.getvalue())
        self.assertIn("Retrieved 2 historical rate points", output.getvalue())

    @patch("urllib.request.urlopen")
    def test_reputation_cli_reads_nested_contract(self, mock_urlopen):
        import contextlib
        import read_anchor_reputation
        mock_urlopen.return_value = make_mock_response(200, {
            "reputation": {
                "anchor": {
                    "slug": "zeam",
                    "name": "Zeam"
                },
                "state": "established",
                "score": 95,
                "scoreBand": "green",
                "evidence": {
                    "outcomeCount": 30
                },
                "metrics": {
                    "fillRate7d": 0.98,
                    "fillRate30d": 0.95,
                    "fillRate90d": 0.94,
                    "settleP50Ms": 1200,
                    "settleP95Ms": 4500,
                    "slippageP50": 0.001,
                    "slippageP95": 0.015
                },
                "computedAt": "2026-08-28T12:00:00.000Z"
            }
        }, {"X-Evidence-State": "stale"})
        output = io.StringIO()
        with patch("sys.argv", ["read_anchor_reputation.py", "zeam"]), contextlib.redirect_stdout(output):
            read_anchor_reputation.main()
        self.assertIn("Reputation Score: 95 / 100", output.getvalue())
        self.assertIn("Retained stale reputation", output.getvalue())
        self.assertIn("slippageP95", output.getvalue())

    @patch("urllib.request.urlopen")
    def test_http_400_validation_error(self, mock_urlopen):
        err_body = {
            "error": {
                "code": "invalid_corridor_slug",
                "message": "The corridor slug parameter must contain only lowercase alphanumeric characters and hyphens.",
            }
        }
        mock_urlopen.side_effect = make_mock_http_error(400, err_body)

        with self.assertRaises(StellarCoreApiError) as ctx:
            self.client.get_corridor_rate("INVALID_SLUG!!")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.code, "invalid_corridor_slug")
        self.assertIn("corridor slug parameter", ctx.exception.api_message)

    @patch("urllib.request.urlopen")
    def test_http_404_not_found_error(self, mock_urlopen):
        err_body = {
            "error": {
                "code": "anchor_not_found",
                "message": "No anchor was found for the requested slug.",
            }
        }
        mock_urlopen.side_effect = make_mock_http_error(404, err_body)

        with self.assertRaises(StellarCoreApiError) as ctx:
            self.client.get_anchor("non-existent")

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.code, "anchor_not_found")

    @patch("urllib.request.urlopen")
    def test_http_429_rate_limit_error(self, mock_urlopen):
        err_body = {
            "error": {
                "code": "rate_limit_exceeded",
                "message": "Too many requests. Please slow down.",
            }
        }
        mock_urlopen.side_effect = make_mock_http_error(429, err_body)

        with self.assertRaises(StellarCoreApiError) as ctx:
            self.client.list_corridors()

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.code, "rate_limit_exceeded")

    @patch("urllib.request.urlopen")
    def test_http_500_internal_error(self, mock_urlopen):
        err_body = {
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred while processing the request.",
            }
        }
        mock_urlopen.side_effect = make_mock_http_error(500, err_body)

        with self.assertRaises(StellarCoreApiError) as ctx:
            self.client.list_anchors()

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.code, "internal_error")

    @patch("urllib.request.urlopen")
    def test_network_timeout(self, mock_urlopen):
        mock_urlopen.side_effect = TimeoutError("Connection timed out")

        with self.assertRaises(StellarCoreNetworkError) as ctx:
            self.client.list_anchors()

        self.assertIn("timed out", str(ctx.exception))

    @patch("urllib.request.urlopen")
    def test_malformed_json_response(self, mock_urlopen):
        mock = MagicMock()
        mock.status = 200
        mock.headers = {"Content-Type": "application/json"}
        mock.read.return_value = b"<html>Not JSON</html>"
        mock.__enter__.return_value = mock
        mock.__exit__.return_value = None
        mock_urlopen.return_value = mock

        with self.assertRaises(StellarCoreResponseError) as ctx:
            self.client.list_anchors()

        self.assertIn("Failed to decode JSON", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
