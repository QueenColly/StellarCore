import Link from "next/link";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionSkeleton } from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import { describeReadiness, type ReadinessList, type ReadinessState } from "./readiness";

export type ReadinessViewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string; status: number | null }>
  | Readonly<{ kind: "ready"; list: ReadinessList }>;

const STATE_TONE: Record<ReadinessState, "positive" | "warning" | "neutral"> = {
  established: "positive",
  insufficient_evidence: "warning",
  not_evaluated: "neutral",
};

export function ReadinessView({
  state,
  minimumOutcomes,
}: Readonly<{ state: ReadinessViewState; minimumOutcomes: number }>) {
  if (state.kind === "loading") return <SectionSkeleton label="reputation readiness" />;

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        data-evidence-state="unavailable"
        className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Unavailable</p>
        <p className="mt-2">{state.message}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Reputation evidence could not be loaded. This does not mean it is absent, and no score is implied.
        </p>
      </div>
    );
  }

  const { entries, stale } = state.list;

  return (
    <div>
      {stale && (
        <div role="status" data-evidence-state="stale" className="mb-5 rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-sm text-[#f3b864]">
          Degraded: showing a last-known-good snapshot
          {stale.generatedAt ? <> generated <EvidenceTimestamp value={stale.generatedAt} /></> : null}. These states are not current.
        </div>
      )}

      {entries.length === 0 ? (
        <SectionEmpty message="No reputation records are available for reviewed anchors." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Anchor reputation readiness">
          {entries.map((entry) => {
            const description = describeReadiness(entry, minimumOutcomes);
            const progress = entry.outcomeCount === null
              ? null
              : Math.min(100, Math.round((entry.outcomeCount / Math.max(1, minimumOutcomes)) * 100));
            return (
              <li
                key={entry.anchorSlug}
                data-readiness-state={entry.state}
                className="flex flex-col rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>{entry.anchorName}</h3>
                  <Badge tone={STATE_TONE[entry.state]} label={description.stateLabel} />
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Score</dt>
                    <dd className="mt-1 text-[var(--white)]" data-testid="readiness-score">{description.scoreLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Outcome evidence</dt>
                    <dd className="mt-1 text-[var(--white)]" data-testid="readiness-outcomes">{description.outcomeLabel}</dd>
                    {progress !== null && (
                      <dd className="mt-2">
                        <div
                          role="progressbar"
                          aria-label={`${entry.anchorName} recorded outcomes toward the minimum`}
                          aria-valuemin={0}
                          aria-valuemax={minimumOutcomes}
                          aria-valuenow={Math.min(entry.outcomeCount ?? 0, minimumOutcomes)}
                          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ghost)]"
                        >
                          <div className="h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                        </div>
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Computed</dt>
                    <dd className="mt-1 text-[var(--muted)]">
                      {entry.computedAt ? <EvidenceTimestamp value={entry.computedAt} /> : "Not computed"}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">{description.thresholdNote}</p>

                {description.href && (
                  <Link
                    href={description.href}
                    className="mt-4 inline-flex w-fit items-center gap-1 rounded-sm text-sm text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    View anchor detail<span className="sr-only"> for {entry.anchorName}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
