# Changelog

All notable changes to StellarCore are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries start under `Unreleased` and move into a dated release when that release
ships. See [CONTRIBUTING.md](CONTRIBUTING.md#changelog) for how to add an entry
with your pull request.

## [Unreleased]

### Added

- Public API rate limiting, current API reference, reputation methodology documentation, and reputation property tests (#22, #24, #25, #26).
- Anchor detail UI, median property tests, transfer-outcome webhook schema RFC, and SEP-38 USDC→BRL source research (#5, #7, #18, #21).
- Public API reference and reputation methodology docs, verified public-route rate limiting, and reputation property coverage recovered from PR #83 (#22, #24, #25, #26).
- Anchor detail UI, median-engine property coverage, transfer-outcome webhook schema RFC, and SEP-38 source research from PR #84 (#5, #7, #18, #21).
- Isolated dependency-install reproducibility verification with bounded drift reports and toolchain capture (#237).
- Bounded zero-downtime cron secret rotation with deterministic previous-secret revocation (#184).
- Read-only registry-to-database reconciliation with deterministic drift reports and non-destructive repair plans (#185).
- Verified TLS enforcement for production PostgreSQL connections, including provider CA support and fail-closed startup policy (#181).
- Shared bounded public API error envelopes, status mapping, serialization, and internal reporter seams across current public routes (#177).
- Request-scoped nonce Content Security Policy and hardened browser response headers for App Router pages (#172).
- Integrity-verifiable, bounded evidence export packages with streamed NDJSON members and offline verification (#202).
- Root EditorConfig defaults for consistent cross-editor whitespace, line endings, and indentation (#257).
- Durable three-strike suppression for deterministic scheduled source failures, reviewed reactivation tooling, and aggregate exclusion of suppressed sources (#234).
- Deterministic scheduled evidence-pipeline fault-injection coverage with documented recovery/failure matrix (#171).
- Deployment-bound, secret-safe runtime configuration fingerprints with startup drift enforcement and release provenance binding (#214).
- Repository-wide raw SQL boundary auditing with reviewed allowlists, CI enforcement, and adversarial parameterization tests (#217).
- Canonical IDNA hostname identity for anchor registry, SEP-1, and outbound DNS trust decisions (#233).
- Read-only bounded integrity auditing for persisted evidence relationships and semantic invariants (#190).
- Versioned public API compatibility fixtures and CI breaking-change gates for anchors, corridors, rates, and reputation (#208).
- Typed startup runtime configuration validation with environment-specific requirements and secret-safe diagnostics (#175).
- GitHub issue template for proposing a new corridor to the StellarCore registry (#4).
- Exact asset identity enforcement and exact decimal arithmetic validation for normalized SEP-38 rate observations (#164).
- Hardened PostgreSQL pool management with bounded connection acquisition, TCP keepalive, connection lifetime recycling, and failover-aware stale-connection handling (#209).
- Database deadline and transaction-safety helpers for failover windows, including explicit ambiguous-commit reporting (#209).
- Isolated PostgreSQL wire-level failover tests covering outage, recovery, interrupted transactions, deadlines, and pool storm bounds (#209).
- Operational failover behavior and tuning guidance in `docs/database-failover.md` (#209).

### Fixed

- Prevented stale pooled PostgreSQL connections from being reused indefinitely after transient primary termination or endpoint rotation (#209).

## [Prior work] — 2026-09-25

Summary of development before this changelog was introduced. Only highlights
are listed; see the full commit history for details.

### Added

- SEP-10 authentication boundary and opt-in integration harness.
- SEP-38 quote client and rate engine with live rate sources, a latest-rate
  read model, and a public rates API.
- Public anchors and corridors APIs with reviewed, offline-auditable
  anchor/corridor registries.
- Reputation engine and public reputation API.
- Scheduled refresh for keeping rates and evidence current.
- Public dashboard and landing page, including rate-source, anchor-capability,
  and evidence-legend transparency.
- Production deployment on Vercel with a manual production-migration workflow
  and a manual production registry bootstrap workflow.

### Changed

- Aligned rate identity with persisted evidence.
- Aligned documentation with production and added the contribution workflow.

[Unreleased]: https://github.com/Aboyeji-Isaac/StellarCore/commits/main/
[Prior work]: https://github.com/Aboyeji-Isaac/StellarCore/tree/main
