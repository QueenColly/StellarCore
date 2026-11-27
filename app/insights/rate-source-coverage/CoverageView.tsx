import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionSkeleton } from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import { summarizeCoverage, type CoverageExplanation, type CoverageRates } from "./coverage";

export type CoverageViewState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; rates: CoverageRates }>;

const EXPLANATION_TONE: Record<CoverageExplanation["kind"], "positive" | "warning" | "negative" | "neutral"> = {
  published: "positive",
  insufficient: "warning",
  registry_limit: "warning",
  missing: "neutral",
  stale: "warning",
  excluded: "negative",
  invalid: "negative",
};

const EXPLANATION_LABEL: Record<CoverageExplanation["kind"], string> = {
  published: "Published",
  insufficient: "Insufficient",
  registry_limit: "Registry",
  missing: "Missing",
  stale: "Stale",
  excluded: "Excluded",
  invalid: "Invalid",
};

/** Inline error panel; no router-dependent retry, the selector re-requests. */
function CoverageError({ message }: Readonly<{ message: string }>) {
  return (
    <div
      role="alert"
      data-evidence-state="unavailable"
      className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Unavailable</p>
      <p className="mt-2">{message}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Evidence could not be loaded. This does not mean it is absent.
      </p>
    </div>
  );
}

export function CoverageView({ state }: Readonly<{ state: CoverageViewState }>) {
  if (state.kind === "idle") {
    return <SectionEmpty message="Select a corridor to see its rate-source coverage." />;
  }
  if (state.kind === "loading") return <SectionSkeleton label="rate-source coverage" />;
  if (state.kind === "error") return <CoverageError message={state.message} />;

  const { rates } = state;
  const summary = summarizeCoverage(rates);
  const steps = [
    {
      key: "candidates",
      term: "Reviewed candidates",
      value: rates.candidateCount,
      detail: `${rates.uniqueAnchorCount} unique ${rates.uniqueAnchorCount === 1 ? "anchor" : "anchors"} in configuration. Not an observation.`,
    },
    {
      key: "persisted",
      term: "Latest persisted observations",
      value: rates.sourceCount,
      detail: "Stored observations, whether fresh or not.",
    },
    {
      key: "fresh",
      term: "Fresh independent observations",
      value: rates.freshSourceCount,
      detail: "Observations eligible for the median.",
    },
    {
      key: "required",
      term: "Required minimum",
      value: rates.minimumFreshIndependentSources,
      detail: "Fresh independent sources needed to publish a median.",
    },
  ];

  return (
    <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 sm:p-6" data-coverage-state={rates.state}>
      {rates.stale && (
        <div role="status" data-evidence-state="stale" className="mb-5 rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-sm text-[#f3b864]">
          Stale snapshot{rates.stale.generatedAt ? <> generated <EvidenceTimestamp value={rates.stale.generatedAt} /></> : null}.
          The live read failed; these values are not current.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>{rates.corridorLabel}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Evaluated <EvidenceTimestamp value={rates.evaluatedAt} />
          </p>
        </div>
        <Badge tone={rates.state === "healthy" ? "positive" : "warning"} label={rates.state.replace(/_/g, " ")} />
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Evidence pipeline">
        {steps.map((step) => (
          <div key={step.key} data-coverage-step={step.key} className="rounded-md border border-[var(--ghost)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{step.term}</dt>
            <dd className="mt-1 text-2xl text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>{step.value}</dd>
            <dd className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{step.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-[var(--ghost)] pt-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Published median</p>
        <p className="mt-1 text-lg text-[var(--white)] break-words" data-testid="coverage-median" style={{ fontFamily: "var(--display)" }}>
          {rates.medianRate === null ? "Not published (null)" : rates.medianRate}
        </p>
      </div>

      <ul className="mt-5 space-y-2" aria-label="Coverage explanation">
        {summary.explanations.map((explanation, index) => (
          <li key={`${explanation.kind}-${index}`} data-explanation={explanation.kind} className="flex flex-col gap-1 rounded-md border border-[var(--ghost)] p-3 sm:flex-row sm:items-start sm:gap-3">
            <Badge tone={EXPLANATION_TONE[explanation.kind]} label={EXPLANATION_LABEL[explanation.kind]} />
            <p className="text-sm leading-relaxed text-[var(--white)]">{explanation.text}</p>
          </li>
        ))}
      </ul>

      {rates.observations.length === 0 ? (
        <div className="mt-6">
          <SectionEmpty message="No rate observations are currently persisted for this corridor." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">Latest persisted observations and their median eligibility</caption>
            <thead>
              <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th scope="col" className="px-3 py-2 font-medium">Anchor</th>
                <th scope="col" className="px-3 py-2 font-medium">Captured</th>
                <th scope="col" className="px-3 py-2 font-medium">Freshness</th>
                <th scope="col" className="px-3 py-2 font-medium">Counts toward median</th>
              </tr>
            </thead>
            <tbody>
              {rates.observations.map((observation, index) => (
                <tr key={`${observation.anchorSlug}-${index}`} className="border-b border-[var(--ghost)] last:border-0">
                  <td className="px-3 py-2 text-[var(--white)]">{observation.anchorName}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {observation.capturedAt ? <EvidenceTimestamp value={observation.capturedAt} /> : "Unknown"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={observation.freshnessState === "fresh" ? "positive" : observation.freshnessState === "stale" ? "warning" : "negative"}
                      label={observation.freshnessState}
                    />
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {observation.eligibleForMedian
                      ? "Yes"
                      : `No${observation.exclusionReason ? ` — ${observation.exclusionReason.replace(/_/g, " ")}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
