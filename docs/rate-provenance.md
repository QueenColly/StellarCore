# Rate-snapshot provenance and source-configuration fingerprinting

This document describes the capture-time provenance implemented for rate
snapshots (#113) and the deterministic rate-source configuration fingerprint
it builds on (#331). It covers which fields are evidence, which are
identifiers, which legacy values are unavailable, and the redaction rules that
keep secrets and raw payloads out of persisted lineage.

## Goals

Every rate snapshot persisted by the reviewed live-rate boundary is traceable,
offline, to:

1. the capture run that wrote it,
2. the reviewed source type and anchor/corridor identity selected at capture
   time, and
3. the reviewed rate-source configuration (via a deterministic digest) and
   request-shape version used to build the candidate.

Public reads never fetch remote data to fill lineage gaps, and legacy rows are
never granted invented provenance.

## Configuration fingerprint (#331)

`lib/rates/sourceConfigurationFingerprint.ts` exposes
`computeRateSourceConfigurationFingerprint(source)`, a pure, offline helper
that returns a SHA-256 digest (64 lowercase hex characters) over one reviewed
rate-source configuration.

### Canonicalization rules

- Only the documented allowlist
  `RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS` is read: `anchorSlug`,
  `corridorSlug`, `sellAsset`, `buyAsset`, `sellAmount`, `buyDeliveryMethod`,
  `countryCode`, `context`.
- Absent optional fields and explicit `undefined` values are dropped, so `{}`
  and `{ buyDeliveryMethod: undefined }` fingerprint identically.
- Object keys are sorted recursively before JSON serialization, so equivalent
  configurations produce the same digest regardless of key order.
- The digest input embeds the version tag
  `RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION`
  (`stellarcore-rate-source-config-v1`).

### Field-selection rules

Included: reviewed identity (anchor, corridor) and the reviewed SEP-38 request
shape. These are checked into `constants/liveRateSources.ts` and reviewed
through configuration changes.

Excluded:

- credentials and secrets of any kind (bearer tokens, authorization headers,
  API keys, private keys, cookies);
- volatile runtime values (quote-server URLs discovered from live SEP-1 TOML,
  timeouts, retries, deployment revision, clock values, environment variables).

The helper reads only allowlisted keys, so an unexpected secret-bearing key on
a richer object can never change or leak through the digest.

### Versioning rules

The version tag is part of the hashed material. Bump
`RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION` whenever the field-selection
rules or canonicalization change; old and new digests then differ by
construction and can never be confused. The digest format itself stays
"64 lowercase hex characters".

## Provenance model (#113)

`rate_snapshot_provenance` is a one-to-one, append-only extension of
`rate_snapshots`. It is written in the same transaction as the snapshot
(`lib/rates/snapshot.ts`), so a snapshot written by the reviewed boundary can
never exist without lineage.

### Evidence, identifiers, and unavailable values

- Identifiers: `captureRunId`, `sourceType`, `anchorSlug`, `corridorSlug`,
  `configurationDigest`, `requestShapeVersion`.
- Evidence timestamps: `capturedAt` (when the observation was captured; equal
  to the snapshot's `captured_at`) and `recordedAt` (when the provenance row
  was written).
- Unavailable: for legacy snapshots that predate this table, lineage is
  unknown. The migration intentionally performs no backfill, and the trace API
  reports those rows as `PROVENANCE_UNAVAILABLE` — never reconstructed from
  the current registry.

### Capture-run identity and the run-ledger boundary

`lib/rates/rateEngine.ts` mints one capture-run identity per engine run (or
accepts an injected `captureRunId`) and persists it with every snapshot of
that run. `capture_run_id` is deliberately a plain string with no foreign
key: the Wave 9 durable refresh-run ledger can adopt this boundary later by
minting compatible identifiers, without a competing run table and without a
schema migration.

### Redaction rules

Provenance records are constructed field by field by
`buildRateSnapshotProvenance` (`lib/rates/provenance.ts`) from an explicit
parameter list. Bearer tokens, authorization headers, private keys, full raw
responses, and URLs containing credentials or query secrets are never accepted
and can never be persisted. Invalid identifiers (bad digest, unstable slugs,
oversized or empty run ids, invalid timestamps) fail closed with specific safe
error codes, and the candidate becomes a bounded run-summary failure instead
of a snapshot row.

### Failed and skipped candidates

Failed or skipped candidates never produce snapshot or provenance rows. They
appear only in the bounded run summaries (`failures`, `skippedSources`),
preserving append-only evidence semantics.

## Inspection path

`traceRateSnapshotProvenance(snapshotId, repository?)`
(`lib/rates/provenanceRepository.ts`) resolves a snapshot id to:

- `{ status: "available", provenance }` — capture-time provenance, or
- `{ status: "unavailable", reason: "SNAPSHOT_NOT_FOUND" }` — no such
  snapshot, or
- `{ status: "unavailable", reason: "PROVENANCE_UNAVAILABLE" }` — legacy
  snapshot without provenance; lineage truthfully unknown.

The Prisma-backed repository performs no network fetches and requires the same
environment-verified database boundary as other evidence repositories.

## Public API impact

None. Public responses and their compatibility contracts are unchanged;
provenance is internal lineage only. The latest-observation and median queries
retain their semantics and indexes: the provenance table adds no columns to
`rate_snapshots`, and the relation direction guarantees existing covering
indexes are untouched.

## Tests

- `tests/unit/rates/sourceConfigurationFingerprint.test.ts` — key-order
  stability, meaningful-change sensitivity, excluded secret/volatile fields,
  allowlist shape.
- `tests/unit/rates/provenance.test.ts` — builder normalization, validation
  codes, redaction, run-id minting.
- `tests/unit/rates/rateEngine.test.ts` and
  `tests/faults/rateEngineFaults.test.ts` — capture-time provenance wiring,
  shared run ids, fail-closed behavior for unusable digests.
- `tests/integration/rates/provenance.integration.test.ts` — offline
  composition: candidate → run → snapshot + provenance rows → trace lookup,
  legacy unavailability, median semantics unaffected.
- `tests/unit/database/rateSnapshotProvenanceMigration.test.ts` — migration
  shape: append-only, restrictive foreign key, no legacy backfill.
