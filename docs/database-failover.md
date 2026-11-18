# PostgreSQL Failover and Reconnection Behavior

This document defines how StellarCore handles transient PostgreSQL primary outages, provider-managed failovers, and connection endpoint rotations.

## Overview

StellarCore connects to PostgreSQL using `@prisma/adapter-pg` backed by a hardened `pg.Pool`. During a primary failover or endpoint rotation (e.g. AWS Aurora failover, Supabase maintenance, or HA proxy cutover), the application prioritizes safety, data integrity, and fast recovery over indefinite retries.

## Key Invariants

1. **No Hanging Requests**: Network or database partitions must not cause requests to block indefinitely. Every connection acquisition and query is bounded by `connectionTimeoutMillis` and explicit request deadlines.
2. **Commit Integrity**: Interrupted transactions never report success without positive commit confirmation from PostgreSQL. If a disconnection happens mid-commit, the operation is rejected with `TransactionCommitUnconfirmedError`.
3. **Stale Connection Eviction**: When a primary failure or termination is detected, idle connections in the pool are proactively evicted so subsequent requests do not sequentially fail against dead sockets.
4. **Storm Prevention**: The connection pool (`DB_POOL_MAX`) strictly bounds concurrent connections, preventing thundering herds from overwhelming a newly promoted primary.

---

## Degraded Behavior During the Failover Window

When a failover or transient outage occurs, the system exhibits the following deterministic behaviors:

| Component | State During Failover Window | Behavior on Primary Restoration |
|---|---|---|
| **In-flight Queries** | Fail immediately with `isFailoverOrConnectionError` (`ECONNRESET`, `57P01`, `08006`). | Next query acquires a fresh connection to the new primary. |
| **In-flight Transactions** | Terminated and rolled back by PostgreSQL. Application receives `TransactionInterruptedError`. | Work must be retried from the beginning; partial state is discarded. |
| **Transactions in Commit Phase** | If connection drops before `CommandComplete` is received, rejected with `TransactionCommitUnconfirmedError`. | Callers are alerted that resolution is ambiguous; never assumed committed. |
| **Idle Pooled Connections** | Idle connections to the previous primary are evicted from the pool. | New pooled connections resolve the current primary endpoint. |
| **New Incoming Requests** | If new primary is not yet accepting connections, fail fast when deadline or `DB_CONNECTION_TIMEOUT_MS` expires. | Reconnect immediately once primary is healthy. |

---

## Error Classification Matrix

StellarCore strictly distinguishes connection/failover failures from normal query errors:

### Failover & Connection Errors (Trigger Pool Eviction)
- **Node Network Errors**: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ENETUNREACH`, `EAI_AGAIN`.
- **PostgreSQL Class 08 (Connection Exception)**: `08000`, `08001`, `08003`, `08004`, `08006`.
- **PostgreSQL Class 57P (Operator Intervention)**: `57P01` (admin_shutdown), `57P02` (crash_shutdown), `57P03` (cannot_connect_now).
- **Standby Demotion**: `25006` (`read_only_sql_transaction` when writing to a demoted node).
- **Ambiguous Commit**: `08007` (`transaction_resolution_unknown`).

### Normal Query Errors (Preserve Healthy Connections)
- **Class 23 (Integrity Constraints)**: `23505` (unique), `23503` (foreign key), `23502` (not null).
- **Class 42 (Syntax & Schema)**: `42P01` (table not found), `42703` (column not found), `42601` (syntax error).
- **Class 22 (Data Exceptions)**: `22000`, `22P02`.
- **Class 40 (Concurrency Conflicts)**: `40001` (serialization failure), `40P01` (deadlock).

---

## Pool Configuration & Tuning

The pool is configured in `lib/db/poolManager.ts` with environment variable overrides:

| Parameter | Environment Variable | Default | Purpose |
|---|---|---|---|
| `connectionTimeoutMillis` | `DB_CONNECTION_TIMEOUT_MS` | `5000` | Bounds how long a connection checkout waits before failing. |
| `idleTimeoutMillis` | `DB_IDLE_TIMEOUT_MS` | `30000` | Reclaims idle connections after 30 seconds. |
| `maxLifetimeSeconds` | `DB_MAX_LIFETIME_SECONDS` | `1800` | Recycles connections after 30 minutes to pick up DNS rotations. |
| `keepAliveInitialDelayMillis` | `DB_KEEP_ALIVE_INITIAL_DELAY_MS` | `10000` | Enables TCP keepalive probes every 10s to detect dead peers. |
| `max` | `DB_POOL_MAX` | `10` | Caps concurrent database connections to avoid connection storms. |

---

## Testing & Verification

Isolated integration tests in `tests/integration/db/postgresFailover.integration.test.ts` verify:
1. Stale pooled connection eviction after abrupt socket termination.
2. Multi-request recovery after server outage and endpoint switch.
3. Commit unconfirmed safety for transactions interrupted mid-commit.
4. Deadline enforcement during network blackholes.
5. Connection storm prevention under burst concurrency.
