#!/usr/bin/env python3
"""
Example: Read Public Reputation Evidence for a Reviewed Anchor

Demonstrates reading:
- GET /api/reputation/{anchor_slug}

Important:
- Reputation scores summarize persisted outcome evidence.
- Insufficient or unevaluated evidence has no published score; stale fallback may retain a prior score.
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
        reputation = rep_data["reputation"]
        anchor_info = reputation["anchor"]
        score = reputation["score"]
        state = reputation["state"]
        metrics = reputation["metrics"]
        if rep_data.get("degraded") or rep_data.get("_evidence_state_header") == "stale":
            print("WARNING: Retained stale reputation, not a new evaluation.")

        print(f"Anchor: {anchor_info['name']} ({anchor_info['slug']})")
        print(f"Computed at: {reputation['computedAt'] or 'Unavailable'}")
        print(f"Evaluation State: {state}")

        if score is not None:
            print(f"Reputation Score: {score} / 100")
        else:
            print("Reputation Score: None (insufficient evidence to calculate score)")

        print("\nPersisted metrics:")
        if metrics is None:
            print("  No persisted metrics.")
        else:
            for name, value in metrics.items():
                print(f"  • {name}: {value if value is not None else 'Unavailable'}")

    except StellarCoreApiError as err:
        print(f"API Error ({err.status_code} - {err.code}): {err.api_message}", file=sys.stderr)
    except StellarCoreNetworkError as err:
        print(f"Network error: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
