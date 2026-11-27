
# Evidence Layer Comparison

This guide explains the three evidence layers used by StellarCore:

1. Reviewed configuration.
2. Advertised interfaces.
3. Persisted observations.

These layers answer different questions. They must not be treated as
interchangeable evidence of an anchor's availability, pricing, or ability to
complete a transfer.

StellarCore is a read-only evidence platform. Its public dashboard and API
present information that has been reviewed, advertised, or successfully
persisted. They do not independently guarantee that an external anchor is
currently operational.

## 1. Comparison at a glance

| Evidence layer | Origin | What it establishes | What it cannot establish | Example UI label | Source of truth |
| --- | --- | --- | --- | --- | --- |
| Reviewed configuration | Repository-maintained anchor, corridor, and rate-source configuration | Which anchors, corridors, and rate-source candidates have been explicitly reviewed and configured by StellarCore | That an anchor currently advertises an interface, that an endpoint is reachable, that a price has been returned, or that a transfer can be completed | `Reviewed candidates known to StellarCore` | `constants/anchors.ts`, `constants/corridors.ts`, `constants/liveRateSources.ts`, and `lib/rates/reviewedCandidateConfiguration.ts` |
| Advertised interfaces | SEP metadata declared by an anchor and persisted during synchronization | Which recognized SEP numbers the anchor declared in its metadata when StellarCore synchronized it | That an advertised endpoint is reachable now, that its service is operational, that a rate is valid, or that a transfer will succeed | `Advertised SEPs`, `Transfer interface advertised`, `SEP-38 quote server advertised` | Persisted anchor SEP metadata, `lib/stellar/advertisedCapabilities.ts`, and `lib/api/anchors.ts` |
| Persisted observations | Successful indicative-rate capture and persistence through the reviewed rate pipeline | That StellarCore stored a particular indicative-rate observation at a recorded time, with a freshness classification evaluated by the read model | A firm quote, guaranteed price, live availability, successful fill, completed transfer, or off-chain settlement | `Latest persisted observations`, `Fresh`, `Stale`, `Median rate` | Persisted rate snapshots and provenance, `lib/rates/rateEngine.ts`, `lib/rates/latestRateReadModel.ts`, and `lib/api/rates.ts` |

## 2. Reviewed configuration

Reviewed configuration is information that StellarCore explicitly maintains
and checks into the repository.

Relevant files include:

- [`constants/anchors.ts`](../constants/anchors.ts) — reviewed anchor
  identities and home domains.
- [`constants/corridors.ts`](../constants/corridors.ts) — reviewed corridor
  definitions and anchor-to-corridor associations.
- [`constants/liveRateSources.ts`](../constants/liveRateSources.ts) —
  reviewed indicative-rate source candidates.
- [`lib/rates/reviewedCandidateConfiguration.ts`](../lib/rates/reviewedCandidateConfiguration.ts) —
  reads the reviewed candidate list and reports candidate counts for a
  corridor.

The dashboard's rate panel labels this information
**Reviewed candidates known to StellarCore**.

The candidate count describes static reviewed configuration. It is not a
network request, a database observation, or a live health check.

For example, a configured candidate means StellarCore has reviewed and
configured that source for consideration. It does not mean that the anchor's
endpoint is currently reachable or returning a valid price.

### What configuration does not prove

Reviewed configuration must not be interpreted as:

- Confirmation that the anchor currently advertises the relevant SEP.
- Confirmation that a remote endpoint is reachable.
- Confirmation that an endpoint has returned a valid rate.
- Evidence that an indicative rate is fresh.
- Evidence that a firm quote is available.
- Evidence that a transfer can be completed or settled.

Configuration is an input to the reviewed capture process, not a substitute
for the resulting observation.

## 3. Advertised interfaces

Anchors can publish SEP capabilities and endpoint metadata in their
`stellar.toml` files.

StellarCore synchronizes and persists recognized SEP metadata. The dashboard
presents the recognized values under **Advertised SEPs**.

The presentation helper
[`advertisedCapabilities`](../lib/stellar/advertisedCapabilities.ts) maps
known SEP numbers to cautious labels, including:

- `SEP-6 transfer server advertised`
- `SEP-10 web-auth endpoint advertised`
- `SEP-24 interactive transfer server advertised`
- `SEP-31 direct-payment server advertised`
- `SEP-38 quote server advertised`

An anchor may also display **Transfer interface advertised** when its
persisted SEP metadata includes SEP-6, SEP-24, or SEP-31.

These labels describe advertised metadata. They do not represent a live
connection test or a verified transfer.

### SEP-38 is not proof of a reviewed rate source

An anchor advertising SEP-38 does not automatically become a reviewed
StellarCore rate source.

The advertisement alone does not establish:

- That the endpoint is currently reachable.
- That the requested asset pair is supported.
- That the endpoint returns a valid indicative price.
- That StellarCore has captured and persisted an observation.
- That the observation is fresh or eligible for a median.
- That a firm quote or transfer is available.

A rate-source candidate must be explicitly reviewed and configured. A
successful capture must then be normalized and persisted before it can appear
as a stored observation.

The dashboard explicitly warns that a SEP-38 advertisement does not establish
a reviewed indicative-rate source, current freshness, or a firm quote.

## 4. Persisted observations

Persisted observations are evidence that StellarCore successfully captured
and stored through its reviewed rate pipeline.

The rate engine:

1. Receives a reviewed candidate.
2. Requests an indicative price through its configured quote provider.
3. Normalizes the returned data.
4. Builds capture-time provenance.
5. Persists the observation and provenance when validation succeeds.

Relevant implementation references:

- [`lib/rates/rateEngine.ts`](../lib/rates/rateEngine.ts) — capture,
  normalization, provenance construction, and persistence.
- [`lib/rates/provenance.ts`](../lib/rates/provenance.ts) — capture-time
  provenance construction.
- [`lib/rates/latestRateReadModel.ts`](../lib/rates/latestRateReadModel.ts) —
  reads persisted observations and evaluates freshness.
- [`lib/api/rates.ts`](../lib/api/rates.ts) — public response serialization.
- [`components/dashboard/RatePanel.tsx`](../components/dashboard/RatePanel.tsx) —
  dashboard presentation.

The dashboard distinguishes:

- **Latest persisted observations** — observations stored for the corridor.
- **Freshness** — whether an observation satisfies the configured freshness
  rule at evaluation time.
- **Median evidence** — the number of fresh independent observations compared
  with the minimum required.
- **Median rate** — a value published only when the required evidence is
  available.

The current default freshness threshold is 120 seconds. The median requires at
least two fresh independent observations.

A response with fewer than two eligible fresh independent observations has
`state: "insufficient_fresh_sources"` and `medianRate: null`. This is an
evidence limitation, not proof that an anchor is unavailable.

### Persisted does not mean live

A public rate read uses the persisted read model. It does not perform a new
live SEP-38 request simply because a visitor opens the dashboard or calls the
public rates endpoint.

Freshness is evaluated using the stored observation timestamp and the
evaluation time. A fresh observation is still an indicative-rate observation,
not a firm quote or guarantee of a future price.

## 5. Do not confuse synchronization status with live availability

The anchor dashboard also presents synchronization status badges:

| Dashboard label | Persisted status | Correct interpretation |
| --- | --- | --- |
| `Synced` | `LIVE` | The persisted synchronization state is LIVE |
| `Sync degraded` | `DEGRADED` | The persisted synchronization state is DEGRADED |
| `Sync failed` | `DOWN` | The persisted synchronization state is DOWN |
| `Sync unknown` | `UNKNOWN` | The persisted synchronization state is UNKNOWN |

These labels describe StellarCore's persisted synchronization state. They
must not be read as a guarantee of current anchor uptime, endpoint health, or
transfer availability.

## 6. How to interpret the layers together

Use the following sequence when evaluating an anchor or corridor:

1. **Check reviewed configuration.** Determine whether StellarCore has
   explicitly reviewed and configured the anchor, corridor, or rate-source
   candidate.
2. **Check advertised interfaces.** Inspect the SEP metadata persisted from
   the anchor's published metadata.
3. **Check persisted observations.** Determine whether StellarCore actually
   captured and stored an observation, and inspect its timestamp and
   freshness.
4. **Check the evidence requirement.** Confirm whether enough fresh
   independent observations exist to publish a median.

Do not skip a layer or infer the next one from the previous one.

For example:

- A reviewed candidate is not proof of an advertised SEP.
- An advertised SEP-38 interface is not proof of a reviewed candidate.
- A reviewed candidate and advertised SEP-38 interface are not proof of a
  persisted observation.
- A persisted observation is not a firm quote or proof of transfer settlement.

## 7. Public API references

The public API exposes read-only evidence:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/anchors` | Persisted anchor directory and advertised SEP metadata |
| `GET /api/anchors/{slug}` | One persisted anchor and its associated corridors |
| `GET /api/corridors` | Persisted corridor directory |
| `GET /api/corridors/{slug}` | One persisted corridor and associated anchors |
| `GET /api/rates?corridor={slug}` | Persisted rate observations, freshness, and median evaluation |
| `GET /api/rates/history?corridor={slug}&days={1..365}` | Persisted historical rate evidence |

See the [Public API Reference](api-reference.md) for request parameters,
response schemas, validation behavior, and error responses.

For the capture-time lineage and redaction rules, see
[Rate Snapshot Provenance](rate-provenance.md).

## 8. Evidence integrity rules

When writing about StellarCore or interpreting its dashboard:

- Do not present reviewed configuration as proof of live availability.
- Do not present advertised SEP metadata as proof that an endpoint is working.
- Do not treat SEP-38 advertisement as a validated rate source.
- Do not present a configured candidate as a persisted observation.
- Do not present an indicative-rate observation as a firm quote.
- Do not present a corridor association as an executable route.
- Do not claim a transfer is verified or settled without authorized,
  persisted outcome evidence.
- Do not invent reputation scores or unsupported evidence.
- Label illustrative examples as illustrative, not as captured production
  responses.

The purpose of these distinctions is to make the available evidence useful
without overstating what it proves.
