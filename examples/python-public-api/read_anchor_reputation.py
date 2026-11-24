#!/usr/bin/env python3
"""
Example: Read Public Reputation Evidence for a Reviewed Anchor

Demonstrates reading:
- GET /api/reputation/{anchor_slug}

Important:
- Reputation scores summarize historical evidence across availability, transfer reliability, and freshness.
- When evidence is insufficient or degraded, score is null.
- Null is never coerced to 0.0.
"""

import os
import sys
from client import StellarCoreClient, StellarCoreApiError, StellarCoreNetworkError


def main():
    base_url = os.environ.get("STELLARCORE_BASE_URL", "http://localhost:3000")
    client = StellarCoreClient(base_url=base_url)

    anchor_slug = sys.argv[1] if len(sys.argv) > 1 else "cowrie"
    print(f"Reading public reputation for anchor '{anchor_slug}' from {base_url}...\n")

    try:
        rep_data = client.get_anchor_reputation(anchor_slug)
        anchor_info = rep_data.get("anchor", {})
        score = rep_data.get("score")
        state = rep_data.get("state", "unknown")
        components = rep_data.get("components", {})

        print(f"Anchor: {anchor_info.get('name', anchor_slug)} ({anchor_info.get('homeDomain', 'unknown')})")
        print(f"Evaluation State: {state}")

        if score is not None:
            print(f"Reputation Score: {score} / 100")
        else:
            print("Reputation Score: None (insufficient evidence to calculate score)")

        print("\nComponent Breakdown:")
        for comp_name, comp in components.items():
            comp_score = comp.get("score")
            weight = comp.get("weight", "N/A")
            score_display = f"{comp_score}" if comp_score is not None else "None"
            print(f"  • {comp_name.capitalize()}: Score={score_display} (Weight: {weight})")

    except StellarCoreApiError as err:
        print(f"API Error ({err.status_code} - {err.code}): {err.api_message}", file=sys.stderr)
    except StellarCoreNetworkError as err:
        print(f"Network error: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
