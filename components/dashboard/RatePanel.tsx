
import {
  getRatesApiResult,
  type RatesApiDependencies,
} from "@/lib/api/rates";
import type { RatesApiResult } from "@/types/api/rates";
import type { RateFreshnessState } from "@/types/rates";
import { Badge } from "@/components/dashboard/Badge";
import {
  SectionEmpty,
  SectionError,
} from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";

const FEATURED_CORRIDOR_SLUG = "usdc-us-brl-br";

function isValidEvidenceTime(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function freshnessTone(state: RateFreshnessState) {
  switch (state) {
    case "fresh":
      return "positive" as const;
    case "stale":
      return "warning" as const;
    case "future":
    case "invalid":
      return "negative" as const;
  }
}

export async function RatePanel({
  dependencies,
}: {
  dependencies?: RatesApiDependencies;
} = {}) {
  const result = await getRatesApiResult(
    FEATURED_CORRIDOR_SLUG,
    dependencies,
  );

  return <RatePanelView result={result} />;
}

/** Pure render of a rates API result; contract-tested against canonical fixtures. */
export function RatePanelView({
  result,
}: Readonly<{ result: RatesApiResult }>) {
  if (result.status !== 200) {
    return <SectionError message={result.body.error.message} />;
  }

  const {
    corridor,
    state,
    medianRate,
    sourceCount,
    freshSourceCount,
    reviewedCandidateConfiguration,
    medianRequirement,
    observations,
    evaluatedAt,
  } = result.body;

  const candidateLabel = `${reviewedCandidateConfiguration.candidateCount} configured ${
    reviewedCandidateConfiguration.candidateCount === 1
      ? "candidate"
      : "candidates"
  } across ${reviewedCandidateConfiguration.uniqueAnchorCount} ${
    reviewedCandidateConfiguration.uniqueAnchorCount === 1
      ? "anchor"
      : "anchors"
  }`;

  const observationLabel = `${sourceCount} latest persisted anchor ${
    sourceCount === 1 ? "observation" : "observations"
  }`;

  const medianEvidenceLabel = `${freshSourceCount} fresh independent ${
    freshSourceCount === 1 ? "observation" : "observations"
  } of ${medianRequirement.minimumFreshIndependentSources} required`;

  const latestCapturedAt = observations
    .map(({ capturedAt }) => capturedAt)
    .filter(isValidEvidenceTime)
    .sort()
    .at(-1);

  return (
    <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className="text-xl text-[var(--white)]"
            style={{ fontFamily: "var(--display)" }}
          >
            {corridor.sourceAsset} ({corridor.sourceCountry}) →{" "}
            {corridor.destinationAsset} ({corridor.destinationCountry})
          </h3>

          <p className="mt-1 text-xs text-[var(--muted)]">
            Evaluated <EvidenceTimestamp value={evaluatedAt} />
          </p>

          <p
            className="mt-1 text-xs text-[var(--muted)]"
            data-testid="rate-evidence-freshness"
          >
            {latestCapturedAt
              ? `Latest observation captured ${new Date(
                  latestCapturedAt,
                ).toLocaleString()}`
              : "Freshness unavailable — no valid observation time"}
          </p>
        </div>

        <Badge
          tone={state === "healthy" ? "positive" : "warning"}
          label={state.replace(/_/g, " ")}
        />
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[var(--ghost)] pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Median rate
          </dt>

          <dd
            className={
              medianRate === null
                ? "mt-1 text-lg text-[var(--white)]"
                : "mt-1 text-2xl text-[var(--white)] break-words"
            }
            style={{ fontFamily: "var(--display)" }}
          >
            {medianRate === null ? "Median unavailable" : medianRate}
          </dd>

          {medianRate === null ? (
            <dd className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {medianEvidenceLabel}
            </dd>
          ) : null}
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Configuration
          </dt>

          <dd className="mt-1 text-[var(--white)]">
            Reviewed candidates known to StellarCore
          </dd>

          <dd className="mt-1 text-[var(--muted)]">
            {candidateLabel}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Observations
          </dt>

          <dd className="mt-1 text-[var(--white)]">
            Latest persisted observations
          </dd>

          <dd className="mt-1 text-[var(--muted)]">
            {observationLabel}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Median evidence
          </dt>

          <dd className="mt-1 text-[var(--white)]">
            {medianEvidenceLabel}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Configuration is not proof that a source is operational or currently
        returning a price.
      </p>

      {state === "insufficient_fresh_sources" && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No median is published until the fresh independent-observation
          requirement is met.
        </p>
      )}

      {observations.length === 0 ? (
        <div className="mt-6">
          <SectionEmpty message="No rate observations are currently persisted for this corridor." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">Anchor</th>
                <th className="px-3 py-2 font-medium">Rate</th>
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium">Captured</th>
                <th className="px-3 py-2 font-medium">Freshness</th>
                <th className="px-3 py-2 font-medium">Eligible</th>
              </tr>
            </thead>

            <tbody>
              {observations.map((observation) => (
                <tr
                  key={observation.anchor.slug}
                  className="border-b border-[var(--ghost)] align-top last:border-0"
                >
                  <td className="px-3 py-2 text-[var(--white)]">
                    {observation.anchor.name?.trim()
                      ? observation.anchor.name
                      : observation.anchor.slug}
                  </td>

                  <td className="break-all px-3 py-2 text-[var(--white)]">
                    {observation.rate}
                  </td>

                  <td className="break-all px-3 py-2 text-[var(--muted)]">
                    {observation.fee}
                  </td>

                  <td className="px-3 py-2 text-[var(--muted)]">
                    <EvidenceTimestamp value={observation.capturedAt} />
                  </td>

                  <td className="px-3 py-2">
                    <Badge
                      tone={freshnessTone(observation.freshness.state)}
                      label={observation.freshness.state}
                    />
                  </td>

                  <td className="px-3 py-2 text-[var(--muted)]">
                    {observation.eligibleForMedian
                      ? "Yes"
                      : `No${
                          observation.exclusionReason
                            ? ` — ${observation.exclusionReason.replace(
                                /_/g,
                                " ",
                              )}`
                            : ""
                        }`}
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
