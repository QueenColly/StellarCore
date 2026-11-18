import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../../../prisma/migrations/20261022120000_add_rate_snapshot_provenance/migration.sql",
  import.meta.url,
);

test("provenance migration creates the table, unique link, and run-id index (#113)", async () => {
  const sql = await readFile(MIGRATION, "utf8");

  assert.match(sql, /CREATE TABLE "rate_snapshot_provenance"/);
  assert.match(sql, /"snapshot_id" UUID NOT NULL/);
  assert.match(sql, /"capture_run_id" TEXT NOT NULL/);
  assert.match(sql, /"configuration_digest" TEXT NOT NULL/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "rate_snapshot_provenance_snapshot_id_key" ON "rate_snapshot_provenance"\("snapshot_id"\);/,
  );
  assert.match(
    sql,
    /CREATE INDEX "rate_snapshot_provenance_capture_run_id_idx" ON "rate_snapshot_provenance"\("capture_run_id"\);/,
  );
});

test("provenance rows are append-only and restrict snapshot deletion (#113)", async () => {
  const sql = await readFile(MIGRATION, "utf8");

  // Lineage is immutable evidence: no data-modifying statements at all, and
  // the foreign key prevents deleting a snapshot while provenance references
  // it. Statement-level patterns avoid matching ON DELETE/ON UPDATE clauses.
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  // Statement-level UPDATE only: ON UPDATE CASCADE is a constraint clause.
  assert.doesNotMatch(sql, /(?:^|;)\s*UPDATE\b/im);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  // No drops; ALTER is only allowed to attach the new table's foreign key.
  assert.doesNotMatch(sql, /(?:^|;)\s*DROP\b/im);
  assert.doesNotMatch(sql, /(?:^|;)\s*ALTER\s+TABLE\s+(?!"rate_snapshot_provenance")/im);
  assert.match(
    sql,
    /FOREIGN KEY \("snapshot_id"\) REFERENCES "rate_snapshots"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/,
  );
});

test("legacy snapshots receive no fabricated provenance rows (#113)", async () => {
  const sql = await readFile(MIGRATION, "utf8");

  // Truth constraint: the migration must not invent lineage for pre-existing
  // snapshots. Legacy rows simply have no provenance row, which reads back as
  // explicitly unavailable.
  assert.equal(/\bINSERT\s+INTO\b/i.test(sql), false);
  assert.equal(/\bCOPY\b/i.test(sql), false);
  assert.equal(/\bbackfill\b/i.test(sql.replace(/^--.*$/gm, "")), false);
});
