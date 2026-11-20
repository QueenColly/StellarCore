
# StellarCore Documentation

Welcome to the StellarCore documentation hub.

StellarCore is a read-only intelligence layer for Stellar anchors. It presents persisted anchor metadata, reviewed corridor relationships, indicative-rate observations, and reputation evaluations.

This index helps visitors, developers, contributors, and operators find the documentation relevant to their work.

## Documentation principles

Before using or interpreting StellarCore, keep these distinctions in mind:

- **Reviewed configuration:** Information describing the anchors and corridor relationships reviewed and stored by StellarCore.
- **Advertised capabilities:** SEP interfaces declared by an anchor during synchronization. Advertised capabilities do not prove current availability.
- **Persisted observations:** Individual indicative-rate observations stored by StellarCore. These are not firm quotes.
- **Reputation evaluations:** Calculations based on persisted evidence. A score is not published when the required evidence is insufficient.

StellarCore's public dashboard and public API are read-only. They do not execute transfers or independently verify off-chain settlement.

## 1. Start here

| Document | Description | Recommended for |
| --- | --- | --- |
| [Project README](../README.md) | Project overview, architecture, setup, features, and technical stack. | Everyone |
| [Contributing Guide](../CONTRIBUTING.md) | Contribution expectations, branches, checks, and pull requests. | Contributors |
| [Public Dashboard Guide](dashboard-guide.md) | How to navigate and interpret the four dashboard evidence areas. | Public visitors |
| [Privacy and Custody Boundaries](privacy-custody-boundaries.md) | Explains public read-only functionality, wallet boundaries, and secret-handling guidance. | Public visitors |

## 2. User guides

These documents explain how to use and interpret the information StellarCore exposes.

| Document | Description |
| --- | --- |
| [Dashboard User Guide](dashboard-guide.md) | Understand anchors, corridors, the USDC → BRL rate panel, reputation, and navigation. |
| [Dashboard Recovery Guide](dashboard-recovery-guide.md) | Diagnose failed dashboard requests and distinguish empty, stale, and error states. |
| [Privacy and Custody Boundaries](privacy-custody-boundaries.md) | Understand what public viewers can and cannot do through StellarCore. |

## 3. API references

These documents are intended for developers integrating with or inspecting StellarCore's public HTTP interfaces.

| Document | Description |
| --- | --- |
| [Public API Reference](api-reference.md) | Current public endpoints, methods, request parameters, response contracts, and error handling. |

### Public API route overview

The documented public API includes:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/anchors` | List persisted anchors. |
| GET | `/api/anchors/{slug}` | Retrieve one persisted anchor and its associated corridors. |
| GET | `/api/corridors` | List persisted corridors. |
| GET | `/api/corridors/{slug}` | Retrieve one persisted corridor and associated anchors. |
| GET | `/api/rates?corridor={slug}` | Retrieve rate evidence for a corridor. |
| GET | `/api/rates/history?corridor={slug}&days={1..365}` | Retrieve rate observation history. |
| GET | `/api/reputation` | Retrieve persisted reputation evaluations. |
| GET | `/api/reputation/{slug}` | Retrieve one anchor's reputation evaluation. |

For response schemas, validation rules, pagination, rate limiting, and error codes, consult the [Public API Reference](api-reference.md).

The internal scheduled refresh route is not a public integration endpoint. Its authentication and operational requirements are covered by the deployment documentation.

## 4. Architecture and technical references

| Document | Description |
| --- | --- |
| [Project README](../README.md#architecture) | High-level system architecture and data flow. |
| [Project README](../README.md#database-schema) | Database model overview and evidence boundaries. |
| [Public API Reference](api-reference.md) | API service and response architecture. |
| [Reputation Methodology](reputation-methodology.md) | Evidence inputs, scoring components, thresholds, and score bands. |
| [Outcome Ingestion Architecture RFC](rfc-outcome-ingestion-architecture.md) | Proposed architecture and trust requirements for possible future outcome ingestion. |
| [Outcome Webhook Schema RFC](rfc-outcome-webhook-schema.md) | Proposed transfer-outcome payload and provenance requirements. |

RFC documents describe proposals for review. They must not be interpreted as proof that the proposed functionality is implemented or enabled in production.

## 5. Testing and development

| Document | Description |
| --- | --- |
| [Project README](../README.md#getting-started) | Local environment setup and installation. |
| [Project README](../README.md#running-tests) | Available test and audit commands. |
| [Troubleshooting Guide](troubleshooting.md) | Reproduced local development issues and workarounds. |
| [Contributing Guide](../CONTRIBUTING.md) | Required contributor checks and PR expectations. |

### Standard contributor checks

Run the following commands from the repository root:

```bash
npx tsc --noEmit
npm run lint
npm test
```

Additional audit commands are documented in the README:

```bash
npm run audit:config
npm run audit:compatibility
npm run audit:integrity
```

Use the checks appropriate to the scope of your contribution.

## 6. Operations and security

| Document | Description |
| --- | --- |
| [Production Deployment](DEPLOYMENT.md) | Deployment architecture, environment configuration, migrations, and operational boundaries. |
| [Database TLS Policy](database-tls-policy.md) | Production PostgreSQL transport security requirements. |
| [Troubleshooting Guide](troubleshooting.md) | Local development diagnostics and recovery instructions. |
| [Contributing Guide](../CONTRIBUTING.md) | Evidence integrity and responsible contribution requirements. |
| [Privacy and Custody Boundaries](privacy-custody-boundaries.md) | Public-facing limitations and safe handling of sensitive information. |

These references cover specific implemented controls and operational practices. They do not constitute a claim of regulatory certification or a comprehensive security audit.

## 7. Recommended reading paths

### Public visitors

1. Start with the [Project README](../README.md).
2. Read the [Dashboard User Guide](dashboard-guide.md).
3. Review [Privacy and Custody Boundaries](privacy-custody-boundaries.md).

### Frontend and UI/UX contributors

1. Read the [Project README](../README.md).
2. Review the [Contributing Guide](../CONTRIBUTING.md).
3. Inspect the dashboard implementation in `app/dashboard/page.tsx`.
4. Review the components under `components/dashboard/`.
5. Follow the issue-specific Figma instructions when working on a design contribution.

### Backend and API contributors

1. Read the [Project README](../README.md#architecture).
2. Review the [Public API Reference](api-reference.md).
3. Inspect the relevant handlers under `app/api/` and services under `lib/api/`.
4. Review the [Reputation Methodology](reputation-methodology.md) when working on reputation functionality.
5. Run the relevant tests and API contract checks.

### Test and quality contributors

1. Review the [Contributing Guide](../CONTRIBUTING.md).
2. Follow the testing instructions in the [Project README](../README.md#running-tests).
3. Review the [Troubleshooting Guide](troubleshooting.md).
4. Run the relevant audit commands and regression tests.

### Operations and deployment contributors

1. Review the [Production Deployment Guide](DEPLOYMENT.md).
2. Read the [Database TLS Policy](database-tls-policy.md).
3. Review the [Troubleshooting Guide](troubleshooting.md).
4. Follow the documented environment and migration procedures.

## 8. Design and contribution resources

The following published issues provide examples of the project's UI/UX design work:

- [#564 — Design Light Mode: Header Navigation Bar](https://github.com/Aboyeji-Isaac/StellarCore/issues/564)
- [#566 — Design Light Mode: Public Evidence Console](https://github.com/Aboyeji-Isaac/StellarCore/issues/566)
- [#567 — Design Light Mode: How to Read the Dashboard](https://github.com/Aboyeji-Isaac/StellarCore/issues/567)
- [#569 — Design Light Mode: Corridors Section](https://github.com/Aboyeji-Isaac/StellarCore/issues/569)
- [#570 — Design Light Mode: Reputation Section](https://github.com/Aboyeji-Isaac/StellarCore/issues/570)
- [#571 — Design Light Mode: What You Can Inspect (Horizontal)](https://github.com/Aboyeji-Isaac/StellarCore/issues/571)
- [#572 — Design Light Mode: What You Can Inspect (Vertical)](https://github.com/Aboyeji-Isaac/StellarCore/issues/572)
- [#582 — Design Light Mode: The Product Contract (Four Promises)](https://github.com/Aboyeji-Isaac/StellarCore/issues/582)

For the design handoff process, see [Design Contributions](design-contributions.md).

## 9. Documentation maintenance

When updating documentation:

- Verify technical statements against the current `development` implementation.
- Prefer linking to authoritative documentation rather than duplicating entire sections.
- Use relative links for repository documentation.
- Clearly identify proposed functionality as proposed.
- Never present configuration as proof of live availability.
- Never present indicative rates as firm quotes.
- Never describe an advertised transfer interface as a verified transfer.
- Never invent reputation scores or unsupported evidence.
- Keep examples clearly labelled as illustrative when they are not captured from actual persisted data.

If a document becomes outdated, update the relevant reference and its links in this index.

---

**Documentation scope:** This index is a navigation aid. The linked implementation, tests, and specialized technical documents remain authoritative for their respective subjects.
