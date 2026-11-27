import Link from "next/link";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty } from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import {
  COVERAGE_STATE_LABEL,
  type CorridorCoverageReport,
  type CorridorCoverageRow,
  type CoverageState,
} from "./coverage";

const STATE_TONE: Readonly<Record<CoverageState, "positive" | "warning" | "negative" | "neutral">> = {
  configured_only: "neutral",
  insufficient_fresh: "warning",
  eligible_median: "positive",
  rates_unavailable: "negative",
};

function corridorLabel(row: CorridorCoverageRow): string {
  const { corridor } = row;
  return `${corridor.sourceAsset} (${corridor.sourceCountry}) → ${corridor.destinationAsset} (${corridor.destinationCountry})`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function CoverageAlert({ message }: Readonly<{ message: string }>) {
  return (
    <div
      role="alert"
      data-evidence-state="unavailable"
      className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        Unavailable<span className="sr-only">: </span>
      </p>
      <p className="mt-2">{message}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        The reviewed corridor directory could not be loaded. This does not mean corridors or evidence are absent.
      </p>
    </div>
  );
}

function Row({ row }: Readonly<{ row: CorridorCoverageRow }>) {
  const unavailable = row.kind === "unavailable";
  return (
    <tr
      className="border-b border-[var(--ghost)] align-top last:border-0"
      data-corridor={row.corridor.slug}
      data-coverage-state={row.state}
    >
      <th scope="row" className="px-3 py-3 text-left font-normal">
        <Link
          href={`/corridors/${encodeURIComponent(row.corridor.slug)}`}
          className="text-[var(--white)] underline underline-offset-4 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          {corridorLabel(row)}
        </Link>
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {plural(row.corridor.anchorCount, "reviewed anchor member", "reviewed anchor members")}
        </span>
      </th>
      <td className="px-3 py-3">
        <Badge tone={STATE_TONE[row.state]} label={COVERAGE_STATE_LABEL[row.state]} />
        {row.kind === "evaluated" && row.degraded ? (
          <span className="mt-2 block text-xs text-[#f3b864]" data-evidence-freshness="stale">
            Stale fallback snapshot from <EvidenceTimestamp value={row.degraded.generatedAt} />
          </span>
        ) : null}
        {unavailable ? (
          <span className="mt-2 block text-xs text-[#ee8f81]" role="alert">
            {row.message} Other corridors are unaffected.
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-[var(--muted)]">
        {unavailable
          ? "Unavailable"
          : `${plural(row.candidateCount, "candidate", "candidates")} / ${plural(row.uniqueAnchorCount, "anchor", "anchors")}`}
      </td>
      <td className="px-3 py-3 text-[var(--white)]">{unavailable ? "Unavailable" : row.sourceCount}</td>
      <td className="px-3 py-3 text-[var(--white)]">{unavailable ? "Unavailable" : row.freshSourceCount}</td>
      <td className="px-3 py-3 text-[var(--white)]">{unavailable ? "Unavailable" : row.minimumRequired}</td>
      <td className="px-3 py-3 break-all text-[var(--white)]" data-testid="coverage-median">
        {unavailable || row.medianRate === null ? "Unavailable" : row.medianRate}
      </td>
      <td className="px-3 py-3 text-[var(--muted)]">
        {unavailable ? "Unavailable" : <EvidenceTimestamp value={row.evaluatedAt} />}
      </td>
    </tr>
  );
}

export function CorridorCoverageView({ report }: Readonly<{ report: CorridorCoverageReport }>) {
  if (report.kind === "corridors_unavailable") return <CoverageAlert message={report.message} />;
  if (report.kind === "empty") {
    return <SectionEmpty message="No reviewed corridors are currently persisted." />;
  }

  const lastIndex = report.firstIndex + report.rows.length;
  const partial = report.batchCount > 1;

  return (
    <div>
      <p className="text-sm text-[var(--muted)]" data-testid="coverage-limit">
        {partial
          ? `Showing corridors ${report.firstIndex + 1}–${lastIndex} of ${report.totalCorridors}. To bound server-side reads, at most ${report.batchSize} corridors are evaluated per view; use the batch links below for the rest.`
          : `Showing all ${plural(report.totalCorridors, "reviewed corridor", "reviewed corridors")}.`}
      </p>

      <div
        className="mt-4 overflow-x-auto rounded-lg border border-[var(--ghost)] bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        role="region"
        aria-label="Corridor evidence coverage"
        tabIndex={0}
      >
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Persisted rate-evidence coverage per reviewed corridor. Missing medians are shown as Unavailable, never zero.
          </caption>
          <thead>
            <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <th scope="col" className="px-3 py-2 font-medium">Corridor</th>
              <th scope="col" className="px-3 py-2 font-medium">Evidence state</th>
              <th scope="col" className="px-3 py-2 font-medium">Configured source candidates</th>
              <th scope="col" className="px-3 py-2 font-medium">Persisted observations</th>
              <th scope="col" className="px-3 py-2 font-medium">Fresh independent</th>
              <th scope="col" className="px-3 py-2 font-medium">Minimum required</th>
              <th scope="col" className="px-3 py-2 font-medium">Median</th>
              <th scope="col" className="px-3 py-2 font-medium">Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <Row key={row.corridor.slug} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {partial ? (
        <nav aria-label="Corridor coverage batches" className="mt-4 flex flex-wrap gap-2 text-xs">
          {Array.from({ length: report.batchCount }, (_, index) => index + 1).map((batch) =>
            batch === report.batch ? (
              <span
                key={batch}
                aria-current="page"
                className="rounded border border-[var(--accent)] px-3 py-1 text-[var(--white)]"
              >
                Batch {batch}
              </span>
            ) : (
              <Link
                key={batch}
                href={`/insights/corridor-evidence-coverage?batch=${batch}`}
                className="rounded border border-[var(--ghost)] px-3 py-1 text-[var(--muted)] underline-offset-4 hover:text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Batch {batch}
              </Link>
            ),
          )}
        </nav>
      ) : null}
    </div>
  );
}
