import Link from "next/link";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionSkeleton } from "@/components/dashboard/SectionStates";
import type { AnchorCorridorMatrix, MembershipState } from "./matrix";

export type MatrixViewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string; status: number | null }>
  | Readonly<{ kind: "ready"; matrix: AnchorCorridorMatrix }>;

const MEMBERSHIP_TONE: Record<MembershipState, "positive" | "neutral" | "warning"> = {
  reviewed: "positive",
  not_reviewed: "neutral",
  unknown: "warning",
};

export function MatrixView({ state }: Readonly<{ state: MatrixViewState }>) {
  if (state.kind === "loading") {
    return <SectionSkeleton label="anchor-to-corridor membership matrix" />;
  }

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
          Reviewed corridor memberships could not be loaded.
        </p>
      </div>
    );
  }

  const { anchors, corridors, hasUnknownCells, stale } = state.matrix;

  return (
    <div className="space-y-6">
      {stale && (
        <div
          role="status"
          data-evidence-state="stale"
          className="rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-sm text-[#f3b864]"
        >
          Degraded: showing last-known-good corridor associations. Information may not be current.
        </div>
      )}

      {hasUnknownCells && (
        <div
          role="status"
          className="rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-xs text-[#f3b864]"
        >
          Some corridor detail queries were incomplete or unavailable. Those cells are explicitly marked Unknown rather than assumed unassociated.
        </div>
      )}

      {/* Mandatory configuration disclaimer */}
      <section
        aria-label="Configuration boundary notice"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--muted)]"
      >
        <p className="font-semibold text-[var(--white)] uppercase tracking-wider text-[11px]">
          Configuration Boundary & Notice
        </p>
        <p className="mt-1">
          Membership represents <strong>reviewed directory configuration</strong>.
          It does <strong>not</strong> imply live operational status, active transfer availability, firm quotes, endpoint uptime, or reputation scores.
        </p>
      </section>

      {anchors.length === 0 || corridors.length === 0 ? (
        <SectionEmpty message="No reviewed anchors or corridors available to display." />
      ) : (
        <>
          {/* Accessible Table for wide screens */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Reviewed anchor-to-corridor membership matrix table"
            className="overflow-x-auto rounded-lg border border-[var(--ghost)] bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <table className="min-w-full divide-y divide-[var(--ghost)] text-left text-sm text-[var(--white)]">
              <caption className="sr-only">
                Reviewed anchor-to-corridor membership evidence matrix
              </caption>
              <thead className="bg-[var(--black)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                    Anchor
                  </th>
                  {corridors.map((col) => (
                    <th
                      key={col.slug}
                      scope="col"
                      className="px-4 py-3 text-center font-semibold whitespace-nowrap"
                    >
                      <Link
                        href={col.detailHref}
                        className="hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      >
                        {col.label}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ghost)]">
                {anchors.map((row) => (
                  <tr key={row.slug} className="hover:bg-[rgba(255,255,255,0.02)]">
                    <th scope="row" className="px-5 py-4 font-normal text-left whitespace-nowrap">
                      <Link
                        href={row.detailHref}
                        className="font-medium text-[var(--white)] hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      >
                        {row.name}
                      </Link>
                      {row.homeDomain && (
                        <span className="block text-xs text-[var(--muted)]">{row.homeDomain}</span>
                      )}
                    </th>
                    {corridors.map((col) => {
                      const cell = row.memberships[col.slug];
                      const stateKind = cell?.state ?? "unknown";
                      const tone = MEMBERSHIP_TONE[stateKind];
                      const displayLabel =
                        stateKind === "reviewed"
                          ? "Reviewed"
                          : stateKind === "unknown"
                            ? "Unknown"
                            : "Not reviewed";

                      return (
                        <td
                          key={col.slug}
                          data-membership-state={stateKind}
                          data-testid={`cell-${row.slug}-${col.slug}`}
                          className="px-4 py-4 text-center whitespace-nowrap"
                        >
                          <span className="sr-only">
                            {row.name} in {col.label}: {cell?.label ?? "Unknown (data unavailable)"}
                          </span>
                          <Badge tone={tone} label={displayLabel} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow-screen / Mobile Alternative */}
          <div className="space-y-4 md:hidden" aria-label="Mobile corridor membership cards">
            <h3 className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Reviewed Membership Summary (Mobile)
            </h3>
            {anchors.map((row) => (
              <article
                key={`mobile-${row.slug}`}
                className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={row.detailHref}
                    className="font-medium text-[var(--white)] hover:text-[var(--accent)] hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{row.homeDomain}</span>
                </div>
                <div className="space-y-2 pt-2 border-t border-[var(--ghost)] text-xs">
                  {corridors.map((col) => {
                    const cell = row.memberships[col.slug];
                    const isRev = cell?.state === "reviewed";
                    const isUnk = cell?.state === "unknown";
                    return (
                      <div
                        key={`m-${col.slug}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <Link
                          href={col.detailHref}
                          className="text-[var(--muted)] hover:text-[var(--white)] hover:underline truncate"
                        >
                          {col.label}
                        </Link>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                            isRev
                              ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]"
                              : isUnk
                                ? "bg-[rgba(243,184,100,0.14)] text-[#f3b864]"
                                : "bg-[var(--ghost)] text-[var(--muted)]"
                          }`}
                        >
                          {cell?.state === "reviewed"
                            ? "Reviewed"
                            : cell?.state === "unknown"
                              ? "Unknown"
                              : "No"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
