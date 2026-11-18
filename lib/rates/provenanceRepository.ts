import { EnvironmentIsolationRejection } from "@/lib/rates/snapshot";
import type {
  PersistedRateSnapshotProvenance,
  RateSnapshotProvenanceTrace,
} from "@/types/rateProvenance";

export type RateSnapshotProvenanceRepository = Readonly<{
  findProvenanceBySnapshotId: (
    snapshotId: string,
  ) => Promise<PersistedRateSnapshotProvenance | null>;
  snapshotExists: (snapshotId: string) => Promise<boolean>;
}>;

/**
 * Traces a persisted snapshot identifier to its capture-time provenance.
 *
 * This is an internal, read-only inspection path: it performs no network
 * fetches and never reconstructs lineage from the current registry. A missing
 * provenance row for an existing snapshot is reported truthfully as
 * `PROVENANCE_UNAVAILABLE` (legacy row written before provenance existed).
 */
export async function traceRateSnapshotProvenance(
  snapshotId: string,
  repository: RateSnapshotProvenanceRepository =
    PRISMA_RATE_SNAPSHOT_PROVENANCE_REPOSITORY,
): Promise<RateSnapshotProvenanceTrace> {
  const provenance = await repository.findProvenanceBySnapshotId(snapshotId);
  if (provenance) {
    return Object.freeze({
      status: "available" as const,
      provenance: freezeProvenance(provenance),
    });
  }
  if (!(await repository.snapshotExists(snapshotId))) {
    return Object.freeze({
      status: "unavailable" as const,
      reason: "SNAPSHOT_NOT_FOUND" as const,
    });
  }
  return Object.freeze({
    status: "unavailable" as const,
    reason: "PROVENANCE_UNAVAILABLE" as const,
  });
}

async function provenanceDb(): Promise<
  | Readonly<{ ok: true; db: import("@/lib/dbClient").PrismaClient }>
  | Readonly<{ ok: false }>
> {
  try {
    const { ensureDatabaseEnvironment } = await import("@/lib/dbClient");
    await ensureDatabaseEnvironment();
    const { db } = await import("@/lib/dbClient");
    return Object.freeze({ ok: true as const, db });
  } catch {
    return Object.freeze({ ok: false as const });
  }
}

export const PRISMA_RATE_SNAPSHOT_PROVENANCE_REPOSITORY: RateSnapshotProvenanceRepository =
  Object.freeze({
    async findProvenanceBySnapshotId(snapshotId) {
      const environment = await provenanceDb();
      if (!environment.ok) throw new EnvironmentIsolationRejection();
      const row = await environment.db.rateSnapshotProvenance.findUnique({
        where: { snapshotId },
        select: {
          id: true,
          snapshotId: true,
          captureRunId: true,
          sourceType: true,
          anchorSlug: true,
          corridorSlug: true,
          configurationDigest: true,
          requestShapeVersion: true,
          capturedAt: true,
          recordedAt: true,
        },
      });
      if (!row) return null;
      return Object.freeze({
        id: row.id,
        snapshotId: row.snapshotId,
        captureRunId: row.captureRunId,
        sourceType: row.sourceType,
        anchorSlug: row.anchorSlug,
        corridorSlug: row.corridorSlug,
        configurationDigest: row.configurationDigest,
        requestShapeVersion: row.requestShapeVersion,
        capturedAt: new Date(row.capturedAt.getTime()),
        recordedAt: new Date(row.recordedAt.getTime()),
      });
    },
    async snapshotExists(snapshotId) {
      const environment = await provenanceDb();
      if (!environment.ok) throw new EnvironmentIsolationRejection();
      return (
        (await environment.db.rateSnapshot.findUnique({
          where: { id: snapshotId },
          select: { id: true },
        })) !== null
      );
    },
  });

function freezeProvenance(
  provenance: PersistedRateSnapshotProvenance,
): PersistedRateSnapshotProvenance {
  return Object.freeze({
    ...provenance,
    capturedAt: new Date(provenance.capturedAt.getTime()),
    recordedAt: new Date(provenance.recordedAt.getTime()),
  });
}
