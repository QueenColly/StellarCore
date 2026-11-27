import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

/**
 * Degraded (stale fallback) metadata as documented by `lib/api/staleEvidence.ts`.
 *
 * A read service returns HTTP 200 with `degraded` on the result and/or on the
 * body when it serves a bounded, verified last-known-good snapshot during a
 * transient storage failure. The view must never treat that as a fresh read.
 */
type DegradedCarrier = Readonly<{
  degraded?: unknown;
  body?: unknown;
}>;

function isStaleMetadata(value: unknown): value is StaleEvidenceMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StaleEvidenceMetadata>;
  return candidate.state === "stale"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.expiresAt === "string";
}

/**
 * Return the documented degraded metadata for a successful result, preferring
 * the result-level field and falling back to the copy carried on the body.
 * Returns `null` for an ordinary fresh read.
 */
export function readDegradedMetadata(
  result: DegradedCarrier,
): StaleEvidenceMetadata | null {
  if (isStaleMetadata(result.degraded)) return result.degraded;
  const body = result.body;
  if (typeof body === "object" && body !== null) {
    const carried = (body as { degraded?: unknown }).degraded;
    if (isStaleMetadata(carried)) return carried;
  }
  return null;
}

/**
 * Human-readable snapshot age, derived only from the server-computed
 * `snapshotAgeMs` (the snapshot's age when it was served). The browser clock is
 * never used, so the label cannot drift into implying a newer capture.
 */
export function formatSnapshotAge(ageMs: unknown): string | null {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) {
    return null;
  }
  const totalSeconds = Math.floor(ageMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} ${totalSeconds === 1 ? "second" : "seconds"}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return seconds === 0
    ? minuteLabel
    : `${minuteLabel} ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function latestSourceTime(sourceTimes: unknown): string | null {
  if (!Array.isArray(sourceTimes)) return null;
  const valid = sourceTimes
    .filter((value): value is string => typeof value === "string")
    .filter((value) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
    })
    .sort();
  return valid.at(-1) ?? null;
}

/**
 * Visible, accessible notice for a degraded (stale fallback) read.
 *
 * Never colour-only: it carries a visible "Stale fallback" tag, a dashed
 * border, explanatory copy, and `role="status"`. All timestamps come from the
 * snapshot metadata, never from the current time.
 */
export function StaleEvidenceNotice({
  metadata,
  subject,
}: Readonly<{
  metadata: StaleEvidenceMetadata;
  /** What was retained, e.g. "rate evidence" or "reputation evaluations". */
  subject: string;
}>) {
  const age = formatSnapshotAge(metadata.snapshotAgeMs);
  const sourceTime = latestSourceTime(metadata.sourceTimes);

  return (
    <div
      role="status"
      data-evidence-state="stale"
      data-testid="stale-evidence-notice"
      className="rounded-lg border border-dashed border-[rgba(243,184,100,0.55)] bg-[rgba(243,184,100,0.08)] p-4 text-sm text-[#f3b864]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        Stale fallback
        <span className="sr-only">: </span>
      </p>
      <p className="mt-2 text-[var(--white)]">
        Showing a retained last-known-good snapshot of {subject}. The evidence
        store could not be read for this view, so these values were not re-read
        or re-verified now.
      </p>
      <dl className="mt-3 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-[max-content_1fr] sm:gap-x-3">
        <dt>Snapshot generated</dt>
        <dd className="text-[var(--white)]" data-testid="stale-evidence-generated-at">
          <EvidenceTimestamp value={metadata.generatedAt} />
        </dd>
        <dt>Snapshot age when served</dt>
        <dd className="text-[var(--white)]" data-testid="stale-evidence-age">
          {age ?? "Unavailable"}
        </dd>
        {sourceTime ? (
          <>
            <dt>Latest underlying evidence</dt>
            <dd className="text-[var(--white)]">
              <EvidenceTimestamp value={sourceTime} />
            </dd>
          </>
        ) : null}
        <dt>Fallback expires</dt>
        <dd className="text-[var(--white)]">
          <EvidenceTimestamp value={metadata.expiresAt} />
        </dd>
      </dl>
    </div>
  );
}
