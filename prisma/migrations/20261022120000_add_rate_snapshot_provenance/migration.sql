-- Provenance for rate snapshots (#113). Legacy snapshots written before this
-- migration intentionally receive NO backfill rows: their capture-run and
-- configuration lineage is unknown, and inventing it would fabricate
-- evidence. Reads must report those rows as provenance unavailable.
-- capture_run_id is a plain string (no foreign key) so the Wave 9 durable
-- refresh-run ledger can adopt this boundary later without a competing run
-- table or a schema migration.

-- CreateTable
CREATE TABLE "rate_snapshot_provenance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "capture_run_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "anchor_slug" TEXT NOT NULL,
    "corridor_slug" TEXT NOT NULL,
    "configuration_digest" TEXT NOT NULL,
    "request_shape_version" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_snapshot_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_snapshot_provenance_snapshot_id_key" ON "rate_snapshot_provenance"("snapshot_id");

-- CreateIndex
CREATE INDEX "rate_snapshot_provenance_capture_run_id_idx" ON "rate_snapshot_provenance"("capture_run_id");

-- AddForeignKey
ALTER TABLE "rate_snapshot_provenance" ADD CONSTRAINT "rate_snapshot_provenance_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "rate_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
