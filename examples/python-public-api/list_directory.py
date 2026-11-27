#!/usr/bin/env python3
"""
Example: List Reviewed Anchors and Corridors

Demonstrates reading the public read-only directory endpoints:
- GET /api/anchors
- GET /api/corridors
"""

import os
import sys
from client import StellarCoreClient, StellarCoreApiError, StellarCoreNetworkError


def main():
    base_url = os.environ.get("STELLARCORE_BASE_URL", "http://localhost:3000")
    client = StellarCoreClient(base_url=base_url)

    print(f"Connecting to StellarCore API at {base_url}...\n")

    # 1. Fetch Anchors Directory
    try:
        print("Fetching reviewed anchors directory...")
        anchors_resp = client.list_anchors(limit=5)
        anchors = anchors_resp.get("anchors", [])
        total_anchors = anchors_resp.get("count", 0)

        print(f"Found {total_anchors} reviewed anchor(s) in response. Showing {len(anchors)}:")
        for a in anchors:
            status = a.get("status", "UNKNOWN")
            seps = ", ".join(str(s) for s in a.get("seps", []))
            transfer = "Yes" if a.get("isTransferCapable") else "No"
            print(f"  • {a.get('name')} ({a.get('slug')}): Status={status}, SEPs=[{seps}], AdvertisedTransferInterface={transfer}")

    except StellarCoreApiError as err:
        print(f"API Error fetching anchors ({err.status_code} - {err.code}): {err.api_message}", file=sys.stderr)
    except StellarCoreNetworkError as err:
        print(f"Network error: {err}", file=sys.stderr)

    print("\n" + "-" * 50 + "\n")

    # 2. Fetch Corridors Directory
    try:
        print("Fetching reviewed corridors directory...")
        corridors_resp = client.list_corridors(limit=5)
        corridors = corridors_resp.get("corridors", [])
        total_corridors = corridors_resp.get("count", 0)

        print(f"Found {total_corridors} reviewed corridor(s) in response. Showing {len(corridors)}:")
        for c in corridors:
            src = f"{c.get('sourceAsset')} ({c.get('sourceCountry')})"
            dst = f"{c.get('destinationAsset')} ({c.get('destinationCountry')})"
            print(f"  • {c.get('slug')}: {src} → {dst} [Reviewed Anchors: {c.get('anchorCount', 0)}]")

    except StellarCoreApiError as err:
        print(f"API Error fetching corridors ({err.status_code} - {err.code}): {err.api_message}", file=sys.stderr)
    except StellarCoreNetworkError as err:
        print(f"Network error: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
