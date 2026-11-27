import Link from "next/link";
import { SectionEmpty } from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import type { PublicCorridor } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import { corridorOptionLabel, corridorPairLabel } from "./selection";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  ratesResult: RatesApiResult | null;
}>;

/** An empty API string is absent evidence, never a zero value. */
function displayRaw(value: string): string {
  return value.trim().length > 0 ? value : "Not reported";
}

export function RateObservationBreakdownView({
  corridors,
  selectedCorridorSlug,
  ratesResult,
}: Props) {
  const selected = corridors.find(({ slug }) => slug === selectedCorridorSlug);
  const rates = ratesResult?.status === 200 ? ratesResult.body : null;
  const degraded = ratesResult?.status === 200 ? ratesResult.degraded : undefined;
  const observations = rates?.observations ?? [];
  const pair = selected ? corridorPairLabel(selected) : "No reviewed corridor selected";

  return (
    <div className="space-y-6">
      {corridors.length === 0 ? (
        <SectionEmpty message="No reviewed corridors are currently available." />
      ) : (
        <form
          action="/insights/rate-observation-breakdown"
          method="get"
          data-breakdown-form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <p id="breakdown-selector-hint" className="sr-only">
            Use the arrow keys to choose a reviewed corridor, then press Enter or activate the View observations button.
          </p>
          <div className="w-full sm:w-auto">
            <label htmlFor="breakdown-corridor" className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Reviewed corridor
            </label>
            <select
              id="breakdown-corridor"
              name="corridor"
              defaultValue={selectedCorridorSlug}
              aria-describedby="breakdown-selector-hint"
              className="mt-2 w-full max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-2 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:min-w-[22rem]"
            >
              {corridors.map((corridor) => (
                <option key={corridor.slug} value={corridor.slug}>
                  {corridorOptionLabel(corridor)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded border border-[var(--ghost)] px-4 py-2 text-sm hover:bg-[var(--black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            View observations
          </button>
        </form>
      )}

      {ratesResult === null ? (
        <SectionEmpty message="Select a reviewed corridor to inspect its persisted observations." />
      ) : null}

      {ratesResult && ratesResult.status !== 200 ? (
        <div
          role="alert"
          data-evidence-state="unavailable"
          data-breakdown-state="rates-unavailable"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Unavailable<span className="sr-only">: </span>
          </p>
          <p className="mt-2">Unable to load observations: {ratesResult.body.error.message}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Evidence could not be loaded. A failed read is not treated as absent evidence or as a zero value.
          </p>
        </div>
      ) : null}

      {rates ? (
        <section
          aria-labelledby="breakdown-heading"
          data-breakdown-state={observations.length === 0 ? "empty-observations" : "observations"}
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ghost)] pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Selected corridor</p>
              <h2 id="breakdown-heading" className="mt-1 text-xl" style={{ fontFamily: "var(--display)" }}>
                {pair}
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Evaluated <EvidenceTimestamp value={rates.evaluatedAt} />
              </p>
            </div>
            <span
              data-rates-state={rates.state}
              className="rounded-full border border-[var(--ghost)] px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]"
            >
              {rates.state.replace(/_/g, " ")}
            </span>
          </div>

          {degraded ? (
            <p
              role="status"
              data-evidence-state="stale"
              className="mt-4 rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-xs text-[#f3b864]"
            >
              The API returned its persisted last-known-good snapshot because the current read was unavailable.
            </p>
          ) : null}

          <div className="mt-4 rounded-md border border-[var(--ghost)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Published median (from API)</p>
            <p
              data-breakdown-median={rates.medianRate === null ? "null" : "published"}
              className="mt-1 text-xl break-words text-[var(--white)]"
              style={{ fontFamily: "var(--display)" }}
            >
              {rates.medianRate ?? "Not published"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              {rates.medianRate === null
                ? `No median is published: ${rates.freshSourceCount} of ${rates.medianRequirement.minimumFreshIndependentSources} required fresh independent sources are available. No individual row below is promoted to a median on this page.`
                : "The API published this median. No individual row below is promoted to a median on this page."}
            </p>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            These are persisted indicative SEP-38 observations, not executable prices, live offers, or firm quotes.
            Source and destination amounts are recorded evidence, not a transfer instruction. Fees appear exactly as
            reported; the API does not provide a fee denomination, so no currency unit is added.
          </p>

          {observations.length === 0 ? (
            <div className="mt-4">
              <SectionEmpty message="No individual rate observations are currently persisted for this corridor." />
              <p
                className="mt-2 text-xs leading-relaxed text-[var(--muted)]"
                data-breakdown-state="valid-no-data-note"
              >
                This is a successful read with no persisted observations. It is not an API failure and not a zero rate.
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <p id="breakdown-scroll-hint" className="sr-only">
                The observations table scrolls horizontally. Focus it and use the left and right arrow keys to reveal every column.
              </p>
              <div
                role="region"
                aria-label={`Persisted rate observations for ${pair}`}
                aria-describedby="breakdown-scroll-hint"
                tabIndex={0}
                className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
              >
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Persisted indicative SEP-38 source amount, destination amount, reported fee, rate, source anchor,
                    capture timestamp, freshness, and median eligibility for {pair}.
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                      <th scope="col" className="px-3 py-2 font-medium">Anchor</th>
                      <th scope="col" className="px-3 py-2 font-medium">Source amount ({rates.corridor.sourceAsset})</th>
                      <th scope="col" className="px-3 py-2 font-medium">Destination amount ({rates.corridor.destinationAsset})</th>
                      <th scope="col" className="px-3 py-2 font-medium">Fee (as reported)</th>
                      <th scope="col" className="px-3 py-2 font-medium">Rate</th>
                      <th scope="col" className="px-3 py-2 font-medium">Captured (source timestamp)</th>
                      <th scope="col" className="px-3 py-2 font-medium">Freshness</th>
                      <th scope="col" className="px-3 py-2 font-medium">Median eligibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.map((observation, index) => {
                      const slug = observation.anchor.slug.trim();
                      const name = observation.anchor.name.trim() || slug || "Unavailable";
                      return (
                        <tr
                          key={`${slug || "unknown"}-${observation.capturedAt}-${index}`}
                          data-observation-slug={slug}
                          data-captured-at={observation.capturedAt}
                          className="border-b border-[var(--ghost)] align-top last:border-0"
                        >
                          <th scope="row" className="px-3 py-3 text-xs font-medium text-[var(--white)]">
                            {slug ? (
                              <Link
                                href={`/anchors/${encodeURIComponent(slug)}`}
                                className="underline underline-offset-4 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                              >
                                {name}
                                <span className="sr-only"> — view anchor evidence details</span>
                              </Link>
                            ) : name}
                            {slug ? <span className="mt-1 block font-mono text-[10px] text-[var(--muted)]">{slug}</span> : null}
                          </th>
                          <td className="break-all px-3 py-3 font-mono text-xs text-[var(--white)]">
                            {displayRaw(observation.sourceAmount)}
                          </td>
                          <td className="break-all px-3 py-3 font-mono text-xs text-[var(--white)]">
                            {displayRaw(observation.destinationAmount)}
                          </td>
                          <td className="break-all px-3 py-3 font-mono text-xs text-[var(--white)]">
                            {displayRaw(observation.fee)}
                          </td>
                          <td className="break-all px-3 py-3 font-mono text-xs text-[var(--white)]">
                            {displayRaw(observation.rate)}
                          </td>
                          <td className="px-3 py-3 text-xs text-[var(--muted)]">
                            <EvidenceTimestamp value={observation.capturedAt} />
                          </td>
                          <td className="px-3 py-3 text-xs text-[var(--muted)]">
                            {observation.freshness.state.replace(/_/g, " ")}
                          </td>
                          <td className="px-3 py-3 text-xs text-[var(--muted)]">
                            {observation.eligibleForMedian
                              ? "Included"
                              : `Excluded${observation.exclusionReason ? ` — ${observation.exclusionReason.replace(/_/g, " ")}` : ""}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
