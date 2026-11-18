# Database backup and restore runbook

The tested procedure for backing up and restoring the StellarCore PostgreSQL
database. Every step below was actually performed against a non-production
database on 2026-09-25 — the transcript is at the end — per #64. It uses only
standard PostgreSQL tooling (`pg_dump` / `pg_restore`), so it works the same
against any managed Postgres (Prisma Postgres, Supabase, RDS) or a local
container.

## What is being backed up

One PostgreSQL database (the `DATABASE_URL` of the environment). Data falls
into two classes, which matters for recovery decisions:

| Tables | Recoverable without a backup? |
| --- | --- |
| `anchors`, `corridors`, `anchor_corridors` | Mostly — re-derivable from the reviewed registry via `npm run bootstrap:registry`, but manual status edits would be lost |
| `rate_snapshots`, `transfer_outcomes`, `reputation_scores` | **No** — observed history; once lost it cannot be re-captured |
| `_prisma_migrations` | Restored with the dump; required so Prisma recognizes the schema state |

## Prerequisites

- `pg_dump`/`pg_restore` whose **major version ≥ the server's** (check with
  `psql "$SOURCE_URL" -c 'select version()'` and `pg_dump --version`).
- The **direct** connection string — the same class of credential the
  migration workflow uses. Never the pooled/PgBouncer endpoint (on Supabase:
  port 5432, not the 6543 pooler); `pg_dump` holds long transactions that
  poolers break.
- Treat the dump file as a **secret-equivalent artifact**: it contains the
  full production dataset. Store it encrypted and access-controlled; never
  commit it, never attach it to an issue.

## Backup

```bash
# 1. The direct URL for the environment being backed up, in the shell only:
export SOURCE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE'

# 2. Custom-format dump (compressed, selectively restorable):
pg_dump --format=custom --file="stellarcore-$(date +%Y%m%d).dump" "$SOURCE_URL"

# 3. Confirm it is non-trivial in size and record it with its date:
ls -lh stellarcore-*.dump
```

Notes from the verified run: the dump is **online** (no downtime; it reads a
consistent snapshot), and a ~2.5M-row database produced an 86 MB dump in
~30 s. Growth is dominated by `rate_snapshots`, so expect dump time and size
to scale with it.

Cadence: at minimum before every production migration
(`deploy-production-migrations.yml` run) and on a schedule appropriate to how
much observed history you can afford to lose — the tables above cannot be
re-captured.

## Restore

**Always restore into a fresh database and verify it before touching
anything the application points at.** Never `pg_restore --clean` over the
live production database as a first move.

```bash
# 1. Create an empty target database (any reachable Postgres):
psql "$ADMIN_URL" -c 'CREATE DATABASE stellarcore_restore'

# 2. Restore. --no-owner/--no-privileges because the target role (managed
#    Postgres, local container) rarely matches the roles in the dump:
pg_restore --dbname="postgresql://USER:PASSWORD@HOST:5432/stellarcore_restore" \
  --no-owner --no-privileges stellarcore-YYYYMMDD.dump
```

A ~2.5M-row restore took ~1 m 50 s in the verified run. `pg_restore` exits
nonzero on any error; a clean exit is necessary but not sufficient — run the
verification below every time.

### Verification checklist (all performed in the test)

```bash
export RESTORED_URL='postgresql://USER:PASSWORD@HOST:5432/stellarcore_restore'

# a. Row counts match the source for every table:
psql "$RESTORED_URL" -c "select 'anchors', count(*) from anchors
  union all select 'corridors', count(*) from corridors
  union all select 'anchor_corridors', count(*) from anchor_corridors
  union all select 'rate_snapshots', count(*) from rate_snapshots
  union all select 'transfer_outcomes', count(*) from transfer_outcomes
  union all select 'reputation_scores', count(*) from reputation_scores
  union all select '_prisma_migrations', count(*) from _prisma_migrations"

# b. Prisma recognizes the restored schema state:
DATABASE_URL="$RESTORED_URL" npx prisma migrate status   # "Database schema is up to date!"

# c. A real read path answers (the /api/rates latest-per-anchor query):
psql "$RESTORED_URL" -c "SELECT count(*) FROM (
  SELECT DISTINCT ON (anchor_id) id FROM rate_snapshots
  WHERE corridor_id = (SELECT id FROM corridors LIMIT 1)
  ORDER BY anchor_id, captured_at DESC, id DESC) x"
```

### Promoting a restore to production (disaster case)

1. Disable the Vercel cron (per `DEPLOYMENT.md`'s rollback section) so no
   refresh writes race the switch.
2. Restore into a **new** database and complete the checklist above.
3. Point the production `DATABASE_URL` (Vercel env + the GitHub `production`
   environment secret) at the restored database and redeploy.
4. If the dump predates the latest committed migrations, run the
   **Deploy production migrations** workflow to bring it current, then
   re-check `npx prisma migrate status`.
5. Re-enable the cron; verify `GET /api/anchors` and `GET /api/rates?...`
   against production.

The switch-the-URL approach means the old database stays untouched as its own
fallback until you deliberately retire it.

## The verified test (2026-09-25)

Performed against a local Postgres 16 container seeded to production-plus
scale (schema from the committed migrations, 2,488,416 `rate_snapshots`
rows) — **not** against any production or hosted database, per the issue's
out-of-scope rule.

| Step | Result |
| --- | --- |
| `pg_dump --format=custom` of the source | 85.8 MB in 30.2 s, exit 0 |
| `pg_restore --no-owner --no-privileges` into fresh `stellarcore_restore` | 1 m 50 s, exit 0 |
| Row counts source vs restored | identical: anchors 24, corridors 4, anchor_corridors 96, rate_snapshots 2,488,416, `_prisma_migrations` 2 |
| `npx prisma migrate status` against the restored DB | "Database schema is up to date!" |
| Latest-rate-per-anchor production query on restored DB | returns 24 rows (one per anchor), as on the source |

Known limitation, stated honestly: the test exercises the procedure and the
tooling, not the production provider's network path or credentials. The first
scheduled production backup should be followed by one restore drill of that
real dump into a scratch database using exactly the steps above.
