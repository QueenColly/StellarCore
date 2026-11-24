# Research: Safe Read-Only Anchor Endpoint Health Evidence Feasibility

**Document Status:** Complete / Feasibility Assessment  
**Author:** sbreaker404-jpg  
**Target Delivery:** `docs/research/read-only-anchor-endpoint-health-feasibility.md`  
**Related Issues:** #644, #632, #165, #176, #202, #20  

---

## Executive Summary

StellarCore maintains an operational registry of reviewed Stellar anchors, cross-border remittance corridors, and published asset exchange rates. At present, StellarCore records the **persisted metadata synchronization status** of anchors—the recency and schema validity of ingested `stellar.toml` discovery files and catalog records.

To prevent misrepresenting synchronization status as live operational uptime, this feasibility study defines a formal evidence and security framework before any active probing mechanisms are introduced. Active network probing against third-party financial institutions introduces severe security, operational, and legal risks, including Server-Side Request Forgery (SSRF), distributed denial-of-service perception, rate-limiting retaliation, and false attribution.

**Primary Recommendation:** StellarCore should **NOT** implement live network probes at this time. Current public user interfaces must continue to present persisted metadata synchronization recency (as addressed in #632) and published rate freshness without claiming verified operational uptime. Live active probes should only be considered if a dedicated egress proxy with strict pre-resolution DNS filtering, operator consent mechanisms, and rigorous hysteresis (#165) are independently provisioned.

---

## 1. Disambiguation of the Five Operational Health Dimensions

A primary finding of this investigation is that "anchor health" is frequently conflated across fundamentally different operational planes. To preserve data integrity and prevent misleading downstream integrators, StellarCore strictly distinguishes among the following five operational dimensions:

```
+-------------------------------------------------------------------------------+
|                      FIVE OPERATIONAL HEALTH DIMENSIONS                       |
+-------------------------------------------------------------------------------+
| 1. Metadata-Sync State         | Local cron recency of stellar.toml ingestion |
+--------------------------------+----------------------------------------------+
| 2. Endpoint Advertisement      | Declarative discovery URL presence (SEP-1)   |
+--------------------------------+----------------------------------------------+
| 3. Read-Only Availability Obs. | Point-in-time public HTTP handshake success  |
+--------------------------------+----------------------------------------------+
| 4. Source Rate Freshness       | Temporal currency of indicative quotes       |
+--------------------------------+----------------------------------------------+
| 5. Verified Transfer Outcome   | Cryptographic proof of completed payment     |
+-------------------------------------------------------------------------------+
```

### 1.1 Metadata-Sync State
* **Definition:** The local timestamp and status indicating when StellarCore's background cycle (cron) last parsed, validated, and persisted the anchor's public discovery profile (`stellar.toml`).
* **What It Proves:** StellarCore successfully resolved and parsed the anchor's metadata file at time $T_{\text{sync}}$.
* **What It Does NOT Prove:** It does not prove that the anchor's web server, API gateways, custody systems, or Stellar nodes are currently operational.
* **Relevant Work:** Governed by #632 ("Show persisted anchor synchronization overview without claiming live uptime").

### 1.2 SEP Endpoint Advertisement
* **Definition:** The static presence of uniform resource identifiers in the `stellar.toml` file corresponding to standardized SEP endpoints (e.g., `WEB_AUTH_ENDPOINT` for SEP-10, `TRANSFER_SERVER` for SEP-24, `ANCHOR_QUOTE_SERVER` for SEP-38).
* **What It Proves:** The anchor operators publicly intend to support a specific Stellar protocol.
* **What It Does NOT Prove:** It does not verify that the advertised URL resolves, that the SSL certificate is valid, that the underlying daemon is running, or that requests will be serviced.

### 1.3 Read-Only Network Availability Observation
* **Definition:** An unauthenticated, point-in-time HTTP GET request directed at a public, non-transactional metadata endpoint (e.g., `GET /.well-known/stellar.toml` or `GET /info`), observing network reachability, TLS handshake parameters, HTTP status code (e.g., 200 OK vs 503 Service Unavailable), and round-trip latency.
* **What It Proves:** The edge server at the designated endpoint acknowledged an unauthenticated request at the instant of probing.
* **What It Does NOT Prove:** Because anchors heavily utilize Content Delivery Networks (Cloudflare, AWS CloudFront, Fastly), an edge 200 OK often masks an entirely offline core banking backend.

### 1.4 Source Rate Freshness
* **Definition:** The elapsed duration since an anchor published an updated asset conversion rate through SEP-38 (`GET /prices` or `GET /price`).
* **What It Proves:** The anchor's quoting engine was actively generating foreign exchange quotes within the accepted freshness window (e.g., last 5 minutes).
* **What It Does NOT Prove:** It does not guarantee that a customer submitting a transaction at that rate will experience successful execution or deposit settlement.

### 1.5 Verified Transfer Outcome
* **Definition:** Cryptographic, ledger-verified evidence of an end-to-end deposit, withdrawal, or cross-border payment (SEP-6, SEP-24, or SEP-31), attested by Stellar transaction hashes, payment sequence numbers, and terminal transaction states (`completed`).
* **What It Proves:** Complete end-to-end operational functionality across banking rails, Stellar settlement, and anchor fulfillment.
* **What It Does NOT Prove:** Historical success does not guarantee zero-failure execution for future requests. It requires customer authentication, credentials, financial capital, and real money movement.

---

## 2. Public SEP Endpoint Survey & Prohibited Actions

Any probe architecture must strictly define accessible public boundaries under the Stellar Ecosystem Proposals. Probing must never cross into authenticated or transactional space.

### 2.1 Permissible Public Read-Only Inspection Targets

| SEP Standard | Endpoint | Description | Limitations & Edge Behavior |
| :--- | :--- | :--- | :--- |
| **SEP-1** | `GET /.well-known/stellar.toml` | Main anchor discovery document containing accounts, asset definitions, and SEP service endpoints. | Heavily cached by reverse-proxies and edge CDNs; changes may take hours to invalidate. |
| **SEP-24** | `GET <TRANSFER_SERVER>/info` | Public capabilities endpoint declaring supported deposit/withdrawal assets, fee structures, and feature flags. | Unauthenticated. Verifies edge availability of the interactive transfer router, not banking connectivity. |
| **SEP-38** | `GET <ANCHOR_QUOTE_SERVER>/info` | Public asset pairing and exchange capability configuration. | Unauthenticated. Returns static asset mappings; does not test real-time pricing feeds. |
| **SEP-38** | `GET <ANCHOR_QUOTE_SERVER>/prices` | Indicative price quotes for supported asset corridors. | Non-transactional. Does not commit funds or reserve liquidity. Rate limits apply. |
| **SEP-31** | `GET <DIRECT_PAYMENT_SERVER>/info` | Cross-border remittance corridor parameters and required customer fields. | Unauthenticated. Confirms schema availability only. |

### 2.2 Prohibited Endpoints and Operational Actions

Under **no circumstances** may automated health probes invoke or interact with the following:

```
[STRICTLY PROHIBITED ACTIONS]
├── 1. Customer Authentication (SEP-10 challenge signing / JWT minting)
├── 2. Interactive Deposit / Withdrawal (SEP-24 /transactions, /deposit, /withdraw)
├── 3. Firm Quote Creation (SEP-38 POST /quote)
├── 4. Remittance Order Creation (SEP-31 POST /transactions)
├── 5. Customer Data Exchange (SEP-12 /customer submission or polling)
└── 6. Financial Settlement (Fund movement or on-chain transaction submission)
```

1. **Authentication Endpoints (`SEP-10 GET/POST /auth`):**
   * *Prohibition:* Never submit signed challenge transactions or mint JWTs. Automated key custody in probing jobs introduces credential leak vectors.
2. **Firm Quote Endpoints (`SEP-38 POST /quote`):**
   * *Prohibition:* Never request firm quotes. Firm quotes require authentication, lock liquidity on the anchor's book, generate server state, and expire with financial penalties.
3. **Transaction Execution Endpoints (`SEP-24 / SEP-6 / SEP-31`):**
   * *Prohibition:* Never invoke interactive transfer URLs, submit payment claims, or initiate transfers. Probing with test payments requires regulatory licenses, customer accounts, and real currency reserves.
4. **KYC / Identity Endpoints (`SEP-12`):**
   * *Prohibition:* Never query or submit customer personally identifiable information (PII).

---

## 3. Threat Model and Abuse Analysis

Introducing outbound HTTP probes from StellarCore worker daemons into external anchor infrastructure presents substantial threat surface:

### 3.1 Server-Side Request Forgery (SSRF) & DNS Rebinding
* **Vulnerability:** Anchors publish arbitrary URLs in `stellar.toml`. A malicious or compromised anchor configuration could specify endpoints pointing to:
  * `http://169.254.169.254/latest/meta-data/` (Cloud instance metadata services)
  * `http://127.0.0.1:5432/` (Local PostgreSQL cluster)
  * `http://10.0.0.0/8` or `http://192.168.0.0/16` (Private VPC infrastructure)
* **DNS Rebinding:** An attacker controls a domain that resolves to a public IP on initial validation, but returns `127.0.0.1` on subsequent TCP socket connection.
* **Mandatory Mitigations:**
  * Strict custom DNS resolution prior to socket connection: resolve IP address, check against comprehensive RFC 1918 / RFC 3927 / loopback / link-local / multicast blacklists, and pin the socket connection directly to the resolved IP.
  * Disable all HTTP redirect following (`maxRedirects: 0`). Redirect targets must undergo identical isolation validation.
  * Outbound requests must route through an egress proxy enforcing deny-all-private policies.

### 3.2 Accidental Denial of Service (Thundering Herd)
* **Vulnerability:** StellarCore monitoring cycles executing scheduled cron tasks could simultaneously dispatch probes to all configured anchors, overwhelming smaller anchors or triggering cloud WAF defenses (Cloudflare rate limit rules).
* **Mandatory Mitigations:**
  * Jittered scheduling window: randomly distribute probe dispatches across a 15-minute sampling interval.
  * Per-domain concurrency limits: maximum 1 concurrent request per anchor domain.
  * Global rate limiter with exponential backoff on HTTP 429 / 503 responses.

### 3.3 Anchor Operator Perception and Consent
* **Vulnerability:** Unannounced recurring automated requests against financial service providers resemble reconnaissance, vulnerability scanning, or API scraping, risking IP blacklisting of StellarCore nodes.
* **Mandatory Mitigations:**
  * Explicit identification: Every probe request must carry a standardized `User-Agent` header containing contact details:
    `User-Agent: StellarCore-HealthObserver/1.0 (+https://stellarcore.org/docs/research/read-only-anchor-endpoint-health-feasibility.md)`
  * Honor `robots.txt` and provide an opt-out flag in anchor configuration.

---

## 4. Evidence Provenance and "Unknown Remains Unknown"

An evidence-based system must embrace epistemic humility: a measurement system must never guess, interpolate, or fabricate health conclusions when direct observation is missing or ambiguous.

```
+-------------------------------------------------------------------------------+
|                      EVIDENCE & UNCERTAINTY INVARIANTS                        |
+-------------------------------------------------------------------------------+
| Invariant 1: Time of Observation | Immutable timestamp on every sample        |
| Invariant 2: Network Latency     | Exact round-trip duration recorded         |
| Invariant 3: Regional Scope      | Probing region documented (e.g., us-east)  |
| Invariant 4: CDN Fallacy         | Edge 200 != Backend Healthy                |
| Invariant 5: Unknown Remains Unk | Missing or failed probes never yield 'LIVE'|
+-------------------------------------------------------------------------------+
```

### 4.1 Provenance Invariants
Every recorded observation must persist:
1. `observedAt`: ISO 8601 UTC timestamp of request initiation.
2. `endpoint`: Exact URL probed (normalized to public allowlist).
3. `statusCode`: Raw HTTP status code received (or null if network error).
4. `latencyMs`: Measured round-trip handshake and response time.
5. `probeRegion`: Origin cloud region of the probing worker (to identify geographic network bias).
6. `errorClassification`: Enumerated error (`DNS_FAILURE`, `TLS_ERROR`, `TIMEOUT`, `HTTP_STATUS_ERROR`).

### 4.2 False Positives and Source-Level Uncertainty
* **Regional Network Partitions:** A worker in North America may experience a transit outage reaching an anchor in South America, while users in Brazil connect normally.
* **Hysteresis Requirements (#165):** A single probe failure must **never** transition an anchor's status to `DOWN`. Status changes must require consecutive failed observations across multiple probing cycles (e.g., 3 consecutive failures over 30 minutes) before asserting degradation.
* **The "Unknown Remains Unknown" Rule:** If an endpoint times out, fails DNS, or is unconfigured, the system must record `status: "UNKNOWN"` or `evidence: "INSUFFICIENT"`. It must **never** default to `LIVE` or fabricate an operational state.

---

## 5. Feasibility Comparison & Strategic Recommendation

| Evaluation Metric | Option A: Naive Direct HTTP Ping | Option B: Public SEP `/info` & `/prices` with Isolated Proxy | Option C: Active Synthetic Transactions | Option D: Status Quo (Persisted Sync + Rate Freshness) |
| :--- | :--- | :--- | :--- | :--- |
| **Truthfulness** | Low (CDN edge cache false positives) | Moderate (Edge availability only) | High (Full transaction proof) | High (Accurate to metadata & rates) |
| **SSRF / Security Risk** | Critical (Severe vulnerability) | Controlled (Requires isolated proxy) | High (Private key & fund exposure) | Zero (No outbound probing) |
| **Anchor Burden** | Low | Low (Bounded & jittered) | High (Creates state & consumes liquidity) | Zero |
| **Operational Cost** | Minimal | Medium (Dedicated proxy infrastructure) | Prohibitive (Capital reserves & KYC) | Zero |
| **Legal / Compliance** | High (Unsolicited scanning) | Moderate (Requires consent & headers) | Prohibitive (Banking regulations) | Compliant |

### Definitive Recommendation: Adopt Option D (No Implementation of Active Probes)

1. **Do Not Implement Active Probing at Present:**
   Active probing requires an isolated proxy, DNS pinning, rate limiting, and hysteresis logic that StellarCore's lightweight architecture does not currently possess. Implementing naive probes without this infrastructure introduces dangerous SSRF and reliability hazards.
2. **Maintain Strict Truth in Labeling (#632):**
   Continue displaying **Persisted Metadata Synchronization Recency** and **Rate Observation Freshness**. Ensure user interfaces explicitly clarify that metadata synchronization recency is an administrative indexing metric, not verified endpoint uptime.
3. **Future Pre-requisites:**
   If the community demands active network observations in a future wave, implementation must be preceded by:
   * A hardened, isolated egress proxy strictly separating internal database VPCs from external web calls.
   * Integration with the hysteresis state-machine defined in #165.
   * Formal review of anchor operator notification and consent policies.

---

## References

1. **Stellar Ecosystem Proposal 1 (SEP-1):** *Stellar Info File (`stellar.toml`)*. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
2. **Stellar Ecosystem Proposal 10 (SEP-10):** *Stellar Web Authentication*. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
3. **Stellar Ecosystem Proposal 24 (SEP-24):** *Hosted Deposit and Withdrawal*. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
4. **Stellar Ecosystem Proposal 38 (SEP-38):** *Anchor RFQ API*. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0038.md
5. **StellarCore Issue #632:** *Show persisted anchor synchronization overview without claiming live uptime*.
6. **StellarCore Issue #165:** *Add hysteresis and evidence-based state transitions for anchor availability*.
7. **StellarCore Issue #176:** *Add explicit liveness and readiness endpoints with dependency-aware semantics*.
