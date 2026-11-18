
import {
  getReputationApiResult,
  type ReputationApiDependencies,
} from "@/lib/api/reputation";
import type {
  PublicReputationScoreBand,
  PublicReputationState,
  ReputationApiListResult,
} from "@/types/api/reputation";
import { Badge } from "@/components/dashboard/Badge";
import {
  SectionEmpty,
  SectionError,
} from "@/components/dashboard/SectionStates";

function stateCopy(state: PublicReputationState): string {
  switch (state) {
    case "established":
      return "Established";
    case "insufficient_evidence":
      return "Insufficient evidence";
    case "not_evaluated":
      return "Not yet evaluated";
  }
}

function stateTone(state: PublicReputationState) {
  return state === "established" ? ("positive" as const) : ("neutral" as const);
}

function bandTone(band: PublicReputationScoreBand) {
  switch (band) {
    case "green":
      return "positive" as const;
    case "amber":
      return "warning" as const;
    case "red":
      return "negative" as const;
  }
}

function formatMetric(value: number | null): string {
  return value === null ? "—" : String(value);
}

function formatMs(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}

export async function ReputationSection({
  dependencies,
}: {
  dependencies?: ReputationApiDependencies;
} = {}) {
  const result = await getReputationApiResult(dependencies);

  return <ReputationSectionView result={result} />;
}

/** Pure render of a reputation list API result; contract-tested against canonical fixtures. */
export function ReputationSectionView({
  result,
}: Readonly<{ result: ReputationApiListResult }>) {
  if (result.status !== 200) {
    return <SectionError message={result.body.error.message} />;
  }

  const { reputation, count } = result.body;

  if (count === 0) {
    return <SectionEmpty message="No anchors are currently persisted." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {reputation.map((entry) => (
        <article
          key={entry.anchor.slug}
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <h3
              className="text-lg text-[var(--white)]"
              style={{ fontFamily: "var(--display)" }}
            >
              {entry.anchor.name}
            </h3>

            <Badge
              tone={stateTone(entry.state)}
              label={stateCopy(entry.state)}
            />
          </div>

          {entry.state === "established" && entry.score !== null ? (
            <div className="mt-4 flex items-center gap-3">
              <span
                className="text-3xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {entry.score}
              </span>

              <span className="text-xs text-[var(--muted)]">/100</span>

              {entry.scoreBand ? (
                <Badge
                  tone={bandTone(entry.scoreBand)}
                  label={entry.scoreBand}
                />
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-xs text-[var(--muted)]">
              {entry.state === "not_evaluated"
                ? "This anchor has no persisted evaluation yet."
                : "Evidence is too sparse for a published score."}
            </p>
          )}

          {entry.evidence ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Outcomes evaluated:{" "}
              <span className="text-[var(--white)]">
                {entry.evidence.outcomeCount}
              </span>
            </p>
          ) : null}

          {entry.metrics ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              <div>
                <dt>Fill rate 7d</dt>
                <dd className="text-[var(--white)]">
                  {formatMetric(entry.metrics.fillRate7d)}
                </dd>
              </div>

              <div>
                <dt>Fill rate 30d</dt>
                <dd className="text-[var(--white)]">
                  {formatMetric(entry.metrics.fillRate30d)}
                </dd>
              </div>

              <div>
                <dt>Fill rate 90d</dt>
                <dd className="text-[var(--white)]">
                  {formatMetric(entry.metrics.fillRate90d)}
                </dd>
              </div>

              <div>
                <dt>Settlement p50</dt>
                <dd className="text-[var(--white)]">
                  {formatMs(entry.metrics.settleP50Ms)}
                </dd>
              </div>

              <div>
                <dt>Settlement p95</dt>
                <dd className="text-[var(--white)]">
                  {formatMs(entry.metrics.settleP95Ms)}
                </dd>
              </div>

              <div>
                <dt>Slippage p50</dt>
                <dd className="text-[var(--white)]">
                  {formatMetric(entry.metrics.slippageP50)}
                </dd>
              </div>
            </dl>
          ) : null}

          {entry.computedAt ? (
            <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Computed {new Date(entry.computedAt).toLocaleString()}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
