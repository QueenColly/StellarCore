"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  formatObservationTimestampUtc,
  REASON_NOT_REPORTED,
  summarizeMedianExclusions,
  type ExclusionGroup,
} from "@/lib/rates/medianExclusionAudit";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRatesResponse } from "@/types/api/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedSlug: string | null;
  rates: PublicRatesResponse | null;
  stale?: StaleEvidenceMetadata;
}>;

export function MedianExclusionsPanel({
  corridors,
  selectedSlug,
  rates,
  stale,
}: Props) {
  const router = useRouter();
  const audit = useMemo(
    () => (rates ? summarizeMedianExclusions(rates) : null),
    [rates],
  );

  function handleSelect(event: Readonly<{ target: { value: string } }>): void {
    const value = event.target.value;
    if (value) {
      router.push(
        `/insights/median-exclusions?corridor=${encodeURIComponent(value)}`,
      );
    }
  }

  return (
    <section
      aria-labelledby="median-exclusions-heading"
      className="mt-10"
      data-testid="median-exclusions-panel"
    >
      <div>
        <p className="eyebrow">Rate evidence</p>
        <h2
          id="median-exclusions-heading"
          className="mt-2 text-2xl"
          style={{ fontFamily: "var(--display)" }}
        >
          Median exclusion reasons
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Grouped audit of persisted latest-rate observations for this
          corridor. Eligible observations are counted separately; reasons are
          the recorded exclusion reasons, and anything missing is shown as{" "}
          <span className="text-[var(--white)]">{REASON_NOT_REPORTED}</span>.
          The median is not recomputed here.
        </p>
      </div>

      {stale ? (
        <div
          className="mt-5 rounded-lg border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-4 text-xs text-[#f3b864]"
          data-state="stale"
          role="status"
        >
          Stale snapshot data: this view shows last-known-good observations.
        </div>
      ) : null}

      {corridors.length > 0 ? (
        <div className="mt-5">
          <label
            className="text-xs uppercase tracking-wide text-[var(--muted)]"
            htmlFor="median-exclusions-select"
          >
            Select corridor
          </label>
          <select
            id="median-exclusions-select"
            className="mt-2 rounded border border-[var(--ghost)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Corridor"
            value={selectedSlug ?? ""}
            onChange={handleSelect}
          >
            {corridors.map((corridor) => (
              <option key={corridor.slug} value={corridor.slug}>
                {corridor.sourceAsset} → {corridor.destinationAsset}
                {" ("}
                {corridor.slug}
                {")"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {rates === null ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="median-exclusions-empty"
        >
          No corridor rates recorded.
        </p>
      ) : audit ? (
        <>
          <dl className="mt-6 grid gap-3 text-xs text-[var(--muted)] sm:grid-cols-3">
            <AuditCount
              label="Observed observations"
              value={String(audit.observedCount)}
              testId="median-exclusions-observed"
            />
            <AuditCount
              label="Eligible observations"
              value={String(audit.eligibleCount)}
              testId="median-exclusions-eligible"
            />
            <AuditCount
              label="Excluded observations"
              value={String(audit.excludedCount)}
              testId="median-exclusions-excluded"
            />
          </dl>

          {audit.excludedCount === 0 ? (
            <p
              className="mt-6 text-sm text-[var(--muted)]"
              data-testid="median-exclusions-empty"
            >
              No excluded observations recorded for this corridor.
            </p>
          ) : (
            <table
              className="mt-6 w-full border-collapse text-xs text-[var(--muted)]"
              aria-label="Median exclusion groups by reason"
            >
              <thead>
                <tr className="border-b border-[var(--ghost)] text-left text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="py-2 font-medium">
                    Reason
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Observations
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Anchor slugs
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Captured (UTC)
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.groups.map((group) => (
                  <ExclusionGroupRow
                    key={group.reason}
                    group={group}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </section>
  );
}

function ExclusionGroupRow({
  group,
}: Readonly<{ group: ExclusionGroup }>) {
  return (
    <tr
      className="border-b border-[var(--ghost)]"
      data-testid="exclusion-group-row"
    >
      <th scope="row" className="py-2 font-medium text-[var(--white)]">
        {group.reason}
      </th>
      <td className="py-2">{group.count}</td>
      <td className="py-2 font-mono text-[10px]">
        {group.entries.map((entry) => entry.slug).join(", ")}
      </td>
      <td className="py-2 font-mono text-[10px]">
        {group
          .entries.map((entry) => formatObservationTimestampUtc(entry.capturedAt))
          .join(", ")}
      </td>
    </tr>
  );
}

function AuditCount({
  label,
  value,
  testId,
}: Readonly<{ label: string; value: string; testId: string }>) {
  return (
    <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className="mt-1 text-[var(--white)]"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
