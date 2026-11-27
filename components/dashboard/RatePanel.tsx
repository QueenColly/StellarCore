import Link from "next/link";
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
import {
  StaleEvidenceNotice,
  readDegradedMetadata,
} from "@/components/dashboard/StaleEvidenceNotice";

const FEATURED_CORRIDOR_SLUG = "usdc-us-brl-br";
const FEATURED_CORRIDOR_HREF = `/corridors/${encodeURIComponent(FEATURED_CORRIDOR_SLUG)}`;

/**
 * Navigation to the complete read-only corridor page. Rendered in every panel
 * state (including a null median, no observations, or an unavailable rates
 * response) because the corridor page holds configuration, anchors, and
 * history that remain useful without a published median. The copy promises
 * evidence, never a live price.
 */
function CorridorEvidenceLink() {
  return (
    <Link
      href={FEATURED_CORRIDOR_HREF}
      data-testid="featured-corridor-evidence-link"
      className="inline-flex items-center gap-1 rounded-sm text-sm text-[var(--accent)] underline underline-offset-4 hover:text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
    >
      View corridor evidence
      <span aria-hidden="true">→</span>
    </Link>
  );
}

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
    return (
      <>
        <SectionError message={result.body.error.message} />
        <p className="mt-3">
          <CorridorEvidenceLink />
        </p>
      </>
    );
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

  // A degraded 200 carries a retained last-known-good snapshot. Its median and
  // state are shown, but never as a newly verified database read.
  const degraded = readDegradedMetadata(result);
  const retained = degraded !== null;

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
    <div
      className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6"
      data-evidence-freshness={retained ? "stale" : undefined}
    >
      {degraded ? (
        <div className="mb-5">
          <StaleEvidenceNotice metadata={degraded} subject="this corridor's rate evidence" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className="text-xl text-[var(--white)]"
            style={{ fontFamily: "var(--display)" }}
          >
            {corridor.sourceAsset} ({corridor.sourceCountry}) →{" "}
            {corridor.destinationAsset} ({corridor.destinationCountry})
          </h3>

          {retained ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Originally evaluated <EvidenceTimestamp value={evaluatedAt} />{" "}
              (retained snapshot, not re-evaluated)
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Evaluated <EvidenceTimestamp value={evaluatedAt} />
            </p>
          )}

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

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge
            tone={state === "healthy" && !retained ? "positive" : "warning"}
            label={
              retained
                ? `Retained: ${state.replace(/_/g, " ")}`
                : state.replace(/_/g, " ")
            }
          />
          <CorridorEvidenceLink />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[var(--ghost)] pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {retained ? "Median rate (retained snapshot)" : "Median rate"}
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

                  <td className="px-3 py-2 text-[var(--white)] break-all">
                    {observation.rate}
                  </td>

                  <td className="px-3 py-2 text-[var(--muted)] break-all">
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
