# StellarCore Public GET API — Python Integration Examples

This directory provides runnable, dependency-free Python 3 examples for consuming
the public, read-only GET endpoints of StellarCore.

## Key Principles & Evidence Boundaries

1. **Standard Library Only:** Requires only Python 3.9+ with zero third-party packages (`urllib`, `json`, `unittest`).
2. **Read-Only GET:** Connects exclusively to public GET routes (`/api/anchors`, `/api/corridors`, `/api/rates`, `/api/reputation`). Never attempts write operations, mutations, or cron triggers.
3. **Indicative Evidence:** All rates and reputation metrics are market observation evidence. They are **not** live executable transfer quotes or guarantees of settlement availability.
4. **Honest Null Handling:** When evidence is insufficient, `medianRate` or reputation `score` is `null`; a stale fallback can retain a previous value and must be labelled stale. These values are preserved as `None` in Python and **never** coerced to `0` or `0.0`.

## Files

- `client.py`: Reusable standard-library client class (`StellarCoreClient`) with custom exception types (`StellarCoreApiError`, `StellarCoreNetworkError`, `StellarCoreResponseError`).
- `list_directory.py`: Example script reading reviewed anchors and corridors.
- `read_corridor_rates.py`: Example script reading indicative corridor rate snapshots and 30-day rate history.
- `read_anchor_reputation.py`: Example script reading anchor reputation scores and persisted metrics.
- `test_client.py`: Offline `unittest` test suite with complete mock fixtures for success, null states, and error handling.

## Running the Offline Tests

The tests require no network connection, database, or API keys:

```bash
cd examples/python-public-api
python -m unittest test_client.py -v
```

## Running the Examples

Ensure your StellarCore server is running (defaults to `http://localhost:3000`), or configure `STELLARCORE_BASE_URL`:

```bash
# Set custom base URL if needed
export STELLARCORE_BASE_URL="http://localhost:3000"

# List reviewed anchors and corridors
python list_directory.py

# Read indicative rate for a corridor
python read_corridor_rates.py usdc-us-brl-br

# Read reputation for an anchor
python read_anchor_reputation.py cowrie
```
