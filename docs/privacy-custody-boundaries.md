
# StellarCore Privacy and Custody Boundaries

This document explains what visitors can do through StellarCore's current public interface, how its read-only architecture works, and how users should handle sensitive information.

StellarCore is an evidence and intelligence platform for Stellar anchors.

Its public dashboard and public HTTP API provide access to persisted information. They do not provide a public wallet-connected transaction flow or execute transfers on behalf of visitors.

This document describes the current implementation. It does not make claims about future functionality, regulatory certification, or privacy controls that have not been verified.

## 1. What StellarCore does

StellarCore presents four primary categories of persisted evidence:

1. Anchor metadata and synchronization state.
2. Reviewed anchor-to-corridor relationships.
3. Indicative-rate observations.
4. Reputation evaluations based on persisted evidence.

The public interface allows visitors to inspect the information made available through these categories.

The dashboard is designed for read-only inspection.

## 2. What public visitors can do

Visitors can:

- Open the public landing page.
- Navigate to the public dashboard.
- Inspect persisted anchor information.
- Review persisted corridor relationships.
- Inspect stored indicative-rate observations.
- Review reputation evaluation states and available metrics.
- Access the documented public GET API endpoints.
- Consult the project's technical and user documentation.

The public dashboard does not require visitors to connect a wallet to inspect these evidence areas.

## 3. Public API boundaries

StellarCore exposes public HTTP endpoints for retrieving persisted evidence.

The public API is GET-only.

### Public read endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/anchors` | Retrieve persisted anchor records. |
| GET | `/api/anchors/{slug}` | Retrieve an individual anchor and its associated corridors. |
| GET | `/api/corridors` | Retrieve persisted corridor records. |
| GET | `/api/corridors/{slug}` | Retrieve a corridor and its associated anchors. |
| GET | `/api/rates?corridor={slug}` | Retrieve indicative-rate evidence for a corridor. |
| GET | `/api/rates/history?corridor={slug}&days={1..365}` | Retrieve stored rate observation history. |
| GET | `/api/reputation` | Retrieve reputation evaluations. |
| GET | `/api/reputation/{slug}` | Retrieve an individual anchor's reputation evaluation. |

These endpoints retrieve information. They do not provide public write operations for executing transfers or submitting customer transfer outcomes.

For complete request parameters, response structures, and error codes, see the [Public API Reference](api-reference.md).

### API access considerations

Public endpoints are not unlimited.

The API reference documents request rate limiting and the applicable response behavior.

A request may therefore receive a rate-limit response when the configured request limit is exceeded.

Public access should not be interpreted as permission to bypass rate limits or abuse the service.

## 4. Wallet and custody boundaries

### No public wallet connection requirement

The current public dashboard is designed to display evidence without requiring a visitor to connect a Stellar wallet.

Visitors do not need to provide:

- A Stellar wallet password.
- A secret seed.
- A private signing key.
- A hardware wallet recovery phrase.
- A transaction-signing authorization.

### No public transfer execution

The current public dashboard does not provide a workflow for:

- Initiating a Stellar payment.
- Signing a transaction.
- Submitting a transaction to the Stellar network.
- Executing an anchor deposit or withdrawal.
- Managing customer transfer instructions.
- Claiming that an off-chain transfer has settled.

The presence of an advertised SEP capability in an anchor's metadata does not change this boundary.

An anchor may advertise transfer-related interfaces, but StellarCore does not thereby acquire authorization to execute or manage those transfers.

### No public customer-wallet custody workflow

The current public dashboard does not implement a customer-wallet custody or transaction-signing workflow.

This statement describes the public dashboard functionality. It should not be expanded into an unsupported claim about every possible data-processing or infrastructure activity associated with the deployed service.

## 5. Understanding the read-only evidence boundary

The information presented by StellarCore must be interpreted according to its actual evidence source.

| Information | Correct interpretation | Incorrect interpretation |
| --- | --- | --- |
| Anchor synchronization status | Persisted synchronization state. | Guaranteed current uptime. |
| Advertised SEP capabilities | Interfaces declared by an anchor. | Proof of a currently available service. |
| Corridor association | Reviewed persisted relationship. | Proof of an executable transfer route. |
| Indicative-rate observation | Stored price observation at a particular time. | Guaranteed exchange rate or firm quote. |
| Reputation evaluation | Calculation from available persisted evidence. | Independent certification of financial trustworthiness. |
| Transfer outcome model | Implemented data model. | Proof of a trusted production transfer feed. |

### Rate observations

StellarCore stores indicative-rate observations from reviewed SEP-38 candidates.

It does not treat these observations as firm quotes.

The system also requires at least two fresh independent observations before publishing a median.

When the requirement is not satisfied, the median remains unavailable.

### Reputation evaluations

The reputation engine uses persisted evidence and explicit evidence thresholds.

A reputation score is not published merely because an anchor exists or advertises particular SEP interfaces.

When evidence is insufficient, the score remains unavailable.

StellarCore does not infer verified off-chain settlement from the existence of an on-chain payment.

For more details, consult the [Reputation Methodology](reputation-methodology.md).

## 6. Internal operations are separate from public access

StellarCore has internal operational workflows that are separate from the public dashboard and public API.

For example, the scheduled refresh process uses an authenticated internal route:

```text
GET /api/internal/cron/refresh
```

This route is an internal operational boundary, not a public dashboard feature.

Its authentication requirements and environment configuration are documented in the [Production Deployment Guide](DEPLOYMENT.md).

Visitors should not attempt to access internal operational functionality or request operational credentials.

## 7. Protecting sensitive information

Users, contributors, and operators should follow basic secret-handling practices when interacting with StellarCore.

### Never share private credentials

Do not paste or publish:

- Stellar secret seeds.
- Wallet private keys.
- Wallet recovery phrases.
- `DATABASE_URL` credentials.
- `CRON_SECRET` values.
- Database connection credentials.
- Authentication tokens.
- Private signing material.
- Production environment secrets.

A public dashboard inspection does not require these credentials.

### Handling screenshots and issue reports

When reporting a dashboard or API problem:

1. Capture the relevant screen or non-sensitive error information.
2. Include the affected public route when relevant.
3. Describe the expected and observed behavior.
4. Remove tokens, credentials, and other sensitive values.
5. Avoid sharing personal information that is not necessary to diagnose the issue.

For example, a safe report might reference:

```text
GET /api/rates?corridor=usdc-us-brl-br

HTTP status: 500
Error code: internal_error
```

Do not include database URLs, bearer tokens, private keys, or other secrets in the report.

The [Dashboard Recovery Guide](dashboard-recovery-guide.md) provides additional guidance for collecting sanitized diagnostics.

## 8. Infrastructure security references

The repository documents specific security and operational controls.

### Database transport security

See [Production PostgreSQL TLS Policy](database-tls-policy.md).

This document describes the implemented production database TLS requirements, certificate verification, and connection-policy enforcement.

### Environment isolation

See [Production Deployment](DEPLOYMENT.md).

This document explains runtime/database environment identity checks, production configuration, and deployment boundaries.

### Contribution and evidence integrity

See [Contributing to StellarCore](../CONTRIBUTING.md).

Contributors are expected to avoid fabricated information, bypassed validation, and unsupported evidence claims.

These references describe specific controls. They should not be interpreted as proof that every application component has undergone a comprehensive independent security audit.

## 9. What this document does not promise

To avoid misleading visitors, the following claims are not made by this document:

- That StellarCore collects absolutely no user data.
- That every form of user interaction is anonymous.
- That every application or infrastructure component uses comprehensive end-to-end encryption.
- That StellarCore holds a particular regulatory or compliance certification.
- That the application has completed a comprehensive independent security audit.
- That every external anchor is currently available.
- That indicative-rate observations are guaranteed quotes.
- That StellarCore verifies every on-chain and off-chain transfer.
- That all reputation scores are independently established.

Any future privacy, wallet, custody, or transaction-related feature must be documented against its actual implementation and reviewed security boundaries.

## 10. Reporting a security concern

If you identify a potential security issue:

- Do not publish private credentials or exploit details in a public issue.
- Avoid including secrets, private keys, or customer information in diagnostic attachments.
- Consult the repository's available security and contribution guidance before reporting sensitive details.
- Keep ordinary dashboard bugs and documentation improvements separate from sensitive security disclosures.

The repository's current contribution instructions are available in [CONTRIBUTING.md](../CONTRIBUTING.md).

---

**Further reading:** [Documentation Index](README.md) · [Public Dashboard Guide](dashboard-guide.md) · [Public API Reference](api-reference.md) · [Production Deployment](DEPLOYMENT.md)
