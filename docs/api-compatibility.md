# Public API Compatibility Contracts & Breaking-Change Gates

## Overview

StellarCore provides public APIs for anchor discovery, corridor mappings, live exchange rates, and reputation scoring. External applications, wallet clients, and automated integrations rely on consistent response shapes, status codes, and error envelopes.

To guarantee that accidental regressions are detected before code is merged or deployed, StellarCore enforces **executable compatibility contracts** versioned under `contracts/api/v1/`.

## Compatibility Rules

StellarCore classifies API modifications into **breaking changes** and **compatible additive changes**.

### Breaking Changes (Gate FAILS)

The compatibility gate immediately fails if any of the following are detected without an explicit, approved contract update:

1. **Field Removal**: Removing any existing field from a successful or error response.
2. **Field Renaming**: Changing a property key name (e.g., renaming `homeDomain` to `domain`).
3. **Type Mutation**: Changing a field's primitive or complex type (e.g., changing string decimal `medianRate` to a number, or converting an object to an array).
4. **Nullability Regressions**:
   - Returning `null` for a field previously guaranteed to be non-null (e.g., `count`, `slug`, `status`).
   - Returning a non-null value for a field defined as `null` in a particular state (e.g., returning a manufactured score when state is `not_evaluated`).
5. **Status Code Regressions**: Changing the HTTP status code for a documented outcome (e.g., returning 500 instead of 400 for malformed input, or returning 200 instead of 404 for unknown resources).
6. **Error Envelope Regressions**: Altering the `{ error: { code, message } }` envelope, or changing the machine-readable `code` string (e.g., changing `"anchor_not_found"` to `"not_found"`).
7. **Ordering Regressions**: Violating deterministic array ordering (e.g., failing to sort anchors or corridors alphabetically by slug, or failing to sort SEPs numerically).
8. **Semantic Evidence Regressions**: Changing the semantics of derived fields (e.g., altering `isTransferCapable` logic or evidence `outcomeCount`).

### Compatible Additive Changes (Gate PASSES)

Additive changes are permitted under StellarCore's documented additive policy:

1. **New Optional Fields**: Adding new optional or nullable properties to existing objects is backward-compatible. API consumers are expected to ignore unrecognized properties.
2. **New Endpoints**: Introducing new routes or HTTP methods.
3. **Accepting Expanded Inputs**: Accepting additional query parameters or broader input values where appropriate.

When additive fields are detected during `npm run audit:compatibility`, they are highlighted in the audit output without failing the build. Developers are encouraged to record intentional additions by updating the contract fixtures.

## Canonical Fixture Suite

Canonical fixtures live in `contracts/api/v1/fixtures/` and are tracked by `contracts/api/v1/manifest.json`.

| Domain | Endpoint | Scenarios Covered | Fixtures |
| :--- | :--- | :--- | :--- |
| **Anchors** | `GET /api/anchors`<br>`GET /api/anchors/:slug` | Standard list, empty directory, list 500 error, anchor detail with sorted corridors, invalid slug 400, unknown anchor 404, detail 500 error | 7 fixtures |
| **Corridors** | `GET /api/corridors`<br>`GET /api/corridors/:slug` | Standard list, empty directory, list 500 error, corridor detail with associated anchors, empty anchors list, invalid slug 400, unknown corridor 404, detail 500 error | 8 fixtures |
| **Rates** | `GET /api/rates?corridor=:slug` | Healthy median with independent observations, insufficient fresh sources with exclusions, empty observations, missing corridor 400, invalid corridor 400, corridor not found 404, internal error 500 | 7 fixtures |
| **Reputation** | `GET /api/reputation`<br>`GET /api/reputation/:slug` | Multi-anchor list, empty list, list 500 error, established detail with complete metrics, insufficient evidence detail, not evaluated detail, invalid slug 400, unknown anchor 404, detail 500 error | 9 fixtures |
| **Total** | | | **31 fixtures** |

### Dashboard Panel Contracts

The `/dashboard` panels render the same canonical fixtures, so a response-shape change that would break the UI is caught even when the serializer and fixture agree. `tests/support/dashboardContracts.ts` loads the fixtures above (it does not copy them) and lists, per panel, the fields its view reads from a successful response. `tests/unit/frontend/dashboardApiContracts.test.ts` renders each pure view (`AnchorsSectionView`, `CorridorsSectionView`, `RatePanelView`, `ReputationSectionView`) and checks that:

- success fixtures provide every consumed field with the expected type, and the rendered markup shows their values;
- removing, renaming, or retyping any consumed field is reported as a contract violation;
- valid empty results render the panel's empty state, never an error;
- error payloads keep the `{ error: { code, message } }` envelope, render as alerts, and never satisfy the success contract.

When a panel starts reading a new field, add it to that panel's `consumedFields` entry.

### Nondeterministic Field Normalization

Certain fields in API responses naturally vary across executions:
- **Timestamps**: `evaluatedAt`, `capturedAt`, and `computedAt` contain ISO-8601 UTC timestamps.
- **Age Metrics**: `ageMs` reflects dynamic observation age.

The normalizer (`lib/api/compatibility/normalizer.ts`) normalizes valid ISO timestamps to `<ISO_TIMESTAMP>` and valid age numbers to `<AGE_MS>`.

**Semantic Integrity Guarantee**:
The normalizer performs strict validation:
- If a timestamp string contains an invalid date or malformed syntax (e.g., `"2026-02-30T12:00:00.000Z"` or `"not_a_date"`), it is **not** normalized. The mismatch is caught by the comparator.
- Array order is **strictly preserved**. Arrays are never re-sorted during comparison, ensuring that deterministic ordering regressions are caught.

## Verification Commands

### Audit Compatibility
Run the offline compatibility gate against current serializers:
```bash
npm run audit:compatibility
```

Output format:
```json
{
  "ok": true,
  "contractVersion": "v1",
  "totalFixtures": 31,
  "passedFixtures": 31,
  "breakingCount": 0,
  "additiveCount": 0,
  "breakingChanges": [],
  "additiveChanges": []
}
```

If breaking changes exist, the process exits with code 1 and lists the exact path, expected value, and actual value.

### Intentional Reviewed Update Process

If an intentional API change modifies response shapes or contracts:

1. **Review**: The change must be reviewed and approved by the core engineering team.
2. **Execute Update**:
   ```bash
   npm run contract:update -- --reviewed-by="Team/Author" --reason="RFC #X: Added custody metadata"
   ```
   If the change includes breaking modifications, explicitly pass `--accept-breaking`:
   ```bash
   npm run contract:update -- --reviewed-by="Team/Author" --reason="RFC #X: Breaking field transition" --accept-breaking
   ```
3. **Commit Fixtures & Manifest**: The updated fixture files and `contracts/api/v1/manifest.json` (containing new sha256 checksums) must be committed together. Pull requests altering `contracts/` require explicit compatibility review.

## Deprecation & Migration Expectations

1. **Deprecation Notice**: Before removing or modifying any field in a public API, a deprecation notice must be published in `CHANGELOG.md` and documented in the API specifications at least **90 days** prior to removal.
2. **Sunset Header**: Deprecated endpoints or fields may include standard deprecation headers (`Deprecation`, `Sunset`).
3. **Version Transitions**: When breaking changes cannot be avoided, they are introduced under a new contract version (e.g., `contracts/api/v2/`), allowing existing clients to migrate smoothly.
