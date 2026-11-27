import Link from "next/link";
import { describeDuration, describeStaleFallback } from "@/lib/rates/rateHistoryEvidence";
import {
  REPUTATION_BANDS_ORDER,
  REPUTATION_CATEGORY_ORDER,
  describeEstablishedInconsistency,
  describeReputationCategory,
  formatSharePercent,
  summarizeReputationStates,
  type ClassifiedReputation,
  type DistributionShare,
  type ReputationDistributionCategory,
} from "@/lib/reputation/stateDistribution";
import type { PublicReputationListResponse } from "@/types/api/reputation";

type Props = Readonly<{
  response: PublicReputationListResponse | null;
  error?: string | null;
}>;

const PAGE_PATH = "/insights/reputation-state-distribution";

const BAND_LABELS = { green: "Green", amber: "Amber", red: "Red" } as const;

function formatTimestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "Unknown time";
}

function describeShare(value: DistributionShare, noun: string): string {
  return value.denominator === 0
    ? `${value.count} of 0 ${noun}`
    : `${value.count} of ${value.denominator} ${noun} (${formatSharePercent(value.percent)})`;
}

function AnchorItem({ record }: Readonly<{ record: ClassifiedReputation }>) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <Link
        href={`/anchors/${encodeURIComponent(record.slug)}`}
        className="underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {record.name}
      </Link>
      <span className="font-mono text-[var(--muted)]">({record.slug})</span>
      {record.category === "established" && record.band ? (
        <span className="text-[var(--muted)]">
          · {BAND_LABELS[record.band]} band, published score {record.score}
        </span>
      ) : null}
      {record.inconsistency ? (
        <span className="text-[#f59e0b]">
          · {describeEstablishedInconsistency(record.inconsistency)}
        </span>
      ) : null}
      {record.category === "unknown_state" ? (
        <span className="text-[#f59e0b]">· state “{record.rawState}”</span>
      ) : null}
      {record.computedAt ? (
        <span className="text-[var(--muted)]">
          · computed <time dateTime={record.computedAt}>{formatTimestamp(record.computedAt)}</time>
        </span>
      ) : null}
    </li>
  );
}

/**
 * Read-only summary of returned reputation records by state and, for valid
 * established records only, by published band. Anchors are listed by slug,
 * never ranked by score.
 */
export function ReputationStateDistributionView({ response, error = null }: Props) {
  if (response === null) {
    return (
      <div
        role="alert"
        data-testid="reputation-distribution-error"
        className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
      >
        <p>
          Request failed: unable to load the public reputation list
          {error ? ` (${error})` : ""}. This is an operational error, not missing evidence; no
          distribution is shown.
        </p>
        <a
          href={PAGE_PATH}
          className="mt-2 inline-block rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Retry request
        </a>
      </div>
    );
  }

  const summary = summarizeReputationStates(response);
  const stale = describeStaleFallback({ degraded: response.degraded });
  const publishedTotal = summary.states.established.count;

  return (
    <div className="space-y-6">
      {stale.kind !== "fresh" ? (
        <div
          role="status"
          data-testid="reputation-distribution-stale"
          className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
        >
          <p className="font-medium">
            Stale fallback: these counts come from a previously saved copy of the reputation list,
            not a fresh read.
          </p>
          <p className="mt-1">
            {stale.kind === "stale" ? (
              <>
                Copy generated{" "}
                <time dateTime={stale.generatedAt}>{formatTimestamp(stale.generatedAt)}</time>
                {stale.snapshotAgeMs !== null
                  ? ` (${describeDuration(stale.snapshotAgeMs)} old when served)`
                  : ""}
                .
              </>
            ) : (
              "The fallback metadata is missing or malformed, so its generation time cannot be confirmed."
            )}
          </p>
        </div>
      ) : null}

      <section
        aria-labelledby="reputation-source-heading"
        data-testid="reputation-distribution-source"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
      >
        <h3 id="reputation-source-heading" className="text-sm font-medium text-[var(--white)]">
          Source and completeness
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="uppercase tracking-wide text-[var(--muted)]">Records returned</dt>
            <dd className="mt-1 text-sm text-[var(--white)]">
              {summary.returned}
              {summary.reportedCount !== null ? ` (API count: ${summary.reportedCount})` : " (API count unavailable)"}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-[var(--muted)]">Earliest evaluation</dt>
            <dd className="mt-1 text-sm text-[var(--white)]">
              {summary.earliestComputedAt ? (
                <time dateTime={summary.earliestComputedAt}>{formatTimestamp(summary.earliestComputedAt)}</time>
              ) : (
                "None recorded"
              )}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-[var(--muted)]">Latest evaluation</dt>
            <dd className="mt-1 text-sm text-[var(--white)]">
              {summary.latestComputedAt ? (
                <time dateTime={summary.latestComputedAt}>{formatTimestamp(summary.latestComputedAt)}</time>
              ) : (
                "None recorded"
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--muted)]">
          The anchor set comes from reviewed configuration; each state, score, and band is observed
          evidence from the latest persisted evaluation. The public list is not paginated, and every
          proportion below uses only the {summary.returned} returned{" "}
          {summary.returned === 1 ? "record" : "records"}.
          {summary.countMismatch
            ? " The API-reported count does not match the returned records, so this list may be incomplete."
            : ""}
        </p>
      </section>

      {summary.returned === 0 ? (
        <p
          role="status"
          data-testid="reputation-distribution-empty"
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
        >
          The reputation list returned no anchors. This is missing evidence, not a request failure,
          and no proportions are computed.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="reputation-states-heading"
            data-testid="reputation-distribution-states"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <h3 id="reputation-states-heading" className="text-sm font-medium text-[var(--white)]">
              Reputation states
            </h3>
            <div
              role="region"
              aria-label="Reputation states table"
              tabIndex={0}
              className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                  Returned anchors by reputation state ({summary.returned} total)
                </caption>
                <thead>
                  <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th scope="col" className="px-3 py-2 font-medium">State</th>
                    <th scope="col" className="px-3 py-2 font-medium">Anchors</th>
                    <th scope="col" className="px-3 py-2 font-medium">Share of returned anchors</th>
                  </tr>
                </thead>
                <tbody>
                  {REPUTATION_CATEGORY_ORDER.filter(
                    (category) =>
                      category !== "unknown_state" || summary.states.unknown_state.count > 0,
                  ).map((category) => {
                    const value = summary.states[category];
                    return (
                      <tr key={category} className="border-b border-[var(--ghost)] last:border-0">
                        <th scope="row" className="px-3 py-2 font-normal text-[var(--white)]">
                          {describeReputationCategory(category)}
                        </th>
                        <td className="px-3 py-2 font-mono text-xs">
                          {value.count} / {value.denominator}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatSharePercent(value.percent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section
            aria-labelledby="reputation-bands-heading"
            data-testid="reputation-distribution-bands"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <h3 id="reputation-bands-heading" className="text-sm font-medium text-[var(--white)]">
              Published bands (established records only)
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              The denominator is the {publishedTotal} established{" "}
              {publishedTotal === 1 ? "record" : "records"} with a valid published score and band.
              Unpublished and inconsistent records are excluded and are never counted as red.
            </p>
            {publishedTotal === 0 ? (
              <p
                role="status"
                data-testid="reputation-distribution-no-bands"
                className="mt-3 text-xs italic text-[var(--muted)]"
              >
                No returned anchor has a published band, so no band proportions are computed.
              </p>
            ) : (
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {REPUTATION_BANDS_ORDER.map((band) => (
                  <div key={band} className="rounded border border-[var(--ghost)] p-3">
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      {BAND_LABELS[band]} band
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--white)]">
                      {describeShare(summary.bands[band], "published records")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section
            aria-labelledby="reputation-anchors-heading"
            data-testid="reputation-distribution-anchors"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <h3 id="reputation-anchors-heading" className="text-sm font-medium text-[var(--white)]">
              Anchors in each category
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Listed alphabetically by anchor slug within each category. This is not a ranking.
            </p>
            {REPUTATION_CATEGORY_ORDER.map((category: ReputationDistributionCategory) => {
              const members = summary.records
                .filter((r) => r.category === category)
                .sort((a, b) => a.slug.localeCompare(b.slug));
              if (members.length === 0) return null;
              return (
                <div key={category} className="mt-4" data-testid={`reputation-category-${category}`}>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--white)]">
                    {describeReputationCategory(category)} · {members.length}
                  </h4>
                  <ul className="mt-2 space-y-1 text-xs">
                    {members.map((record, index) => (
                      <AnchorItem key={`${record.slug}-${index}`} record={record} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </>
      )}

      <p className="text-xs text-[var(--muted)]">
        Counts describe the current public reputation list only. An anchor without a published
        band has not been rated low; it lacks enough evaluated evidence or has not been evaluated.
        Reputation is indicative evidence, not a trustworthiness ranking or a transfer guarantee.
      </p>
    </div>
  );
}
