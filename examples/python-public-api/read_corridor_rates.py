#!/usr/bin/env python3
"""
Example: Read Indicative Rate and Rate History for a Reviewed Corridor

Demonstrates reading:
- GET /api/rates?corridor={slug}
- GET /api/rates/history?corridor={slug}&days={days}

Important:
- Rates are indicative snapshots derived from candidate observations.
- If fresh independent sources are insufficient, medianRate is null.
- Null is never coerced to 0.0.
"""

import os
import sys
from client import StellarCoreClient, StellarCoreApiError, StellarCoreNetworkError


def main():
    base_url = os.environ.get("STELLARCORE_BASE_URL", "http://localhost:3000")
    client = StellarCoreClient(base_url=base_url)

    corridor_slug = sys.argv[1] if len(sys.argv) > 1 else "usdc-ngn"
    print(f"Reading indicative rate for corridor '{corridor_slug}' from {base_url}...\n")

    try:
        rate_data = client.get_corridor_rate(corridor_slug)
        state = rate_data.get("state", "unknown")
        median = rate_data.get("medianRate")
        fresh_count = rate_data.get("freshSourceCount", 0)
        min_sources = rate_data.get("minimumFreshIndependentSources", 0)
        observations = rate_data.get("observations", [])

        print(f"Corridor: {rate_data.get('corridorSlug', corridor_slug)}")
        print(f"Evaluation State: {state}")

        if median is not None:
            print(f"Published Median Rate: {median}")
        else:
            print("Published Median Rate: None (insufficient fresh independent sources)")

        print(f"Fresh Sources: {fresh_count} / Minimum Required: {min_sources}")
        print(f"Total Observations: {len(observations)}")

        for obs in observations[:3]:
            print(f"  - Source: {obs.get('anchorName')} | Captured: {obs.get('capturedAt')} | Freshness: {obs.get('freshnessState')}")

        print("\n" + "-" * 50 + "\n")

        # Read rate history
        print(f"Fetching 30-day rate history for '{corridor_slug}'...")
        history_data = client.get_rate_history(corridor_slug, days=30)
        history_points = history_data.get("history", [])
        print(f"Retrieved {len(history_points)} historical rate points.")
        for pt in history_points[:3]:
            print(f"  • {pt.get('timestamp')}: Median={pt.get('medianRate') or 'None'} (Sources: {pt.get('sourceCount')})")

    except StellarCoreApiError as err:
        print(f"API Error ({err.status_code} - {err.code}): {err.api_message}", file=sys.stderr)
    except StellarCoreNetworkError as err:
        print(f"Network error: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
