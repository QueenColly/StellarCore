import Link from "next/link";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionSkeleton } from "@/components/dashboard/SectionStates";
import type { CapabilityCellState, SepCapabilityMatrix } from "./matrix";

export type MatrixViewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string; status: number | null }>
  | Readonly<{ kind: "ready"; matrix: SepCapabilityMatrix }>;

const CAPABILITY_TONE: Record<CapabilityCellState, "positive" | "neutral" | "warning"> = {
  advertised: "positive",
  not_advertised: "neutral",
  unknown: "warning",
};

export function MatrixView({ state }: Readonly<{ state: MatrixViewState }>) {
  if (state.kind === "loading") {
    return <SectionSkeleton label="SEP capability matrix" />;
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
          Anchor capabilities could not be loaded from /api/anchors.
        </p>
      </div>
    );
  }

  const { seps, rows, stale } = state.matrix;

  return (
    <div className="space-y-6">
      {stale && (
        <div
          role="status"
          data-evidence-state="stale"
          className="rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-sm text-[#f3b864]"
        >
          Degraded: showing last-synced SEP capabilities. Information may not be current.
        </div>
      )}

      {/* Explicit disclaimer as mandated by acceptance criteria */}
      <section
        aria-label="Capability interpretation notice"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--muted)]"
      >
        <p className="font-semibold text-[var(--white)] uppercase tracking-wider text-[11px]">
          Interpretation & Evidence Bounds
        </p>
        <p className="mt-1">
          Last-synced advertisements reflect SEP-1 stellar.toml data retrieved at last sync.
          Advertised capabilities are <strong>not</strong> live operational health, successful transfers, or current quote availability.
        </p>
      </section>

      {rows.length === 0 ? (
        <SectionEmpty message="No reviewed anchors or advertised SEP capabilities found." />
      ) : (
        <>
          {/* Wide-screen Accessible Table */}
          <div
            tabIndex={0}
            role="region"
            aria-label="SEP capability matrix table scrollable container"
            className="overflow-x-auto rounded-lg border border-[var(--ghost)] bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <table className="min-w-full divide-y divide-[var(--ghost)] text-left text-sm text-[var(--white)]">
              <caption className="sr-only">
                Read-only matrix of advertised SEP capabilities across reviewed anchors
              </caption>
              <thead className="bg-[var(--black)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Anchor
                  </th>
                  {seps.map((sep) => (
                    <th
                      key={sep}
                      scope="col"
                      className="px-4 py-3 text-center font-semibold whitespace-nowrap"
                    >
                      SEP-{sep}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ghost)]">
                {rows.map((row) => (
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
                    {seps.map((sep) => {
                      const cell = row.capabilities[sep];
                      const tone = cell ? CAPABILITY_TONE[cell.state] : "neutral";
                      const displayLabel =
                        cell?.state === "advertised"
                          ? "Advertised"
                          : cell?.state === "unknown"
                            ? "Unknown"
                            : "Not advertised";

                      return (
                        <td
                          key={sep}
                          data-capability-state={cell?.state ?? "unknown"}
                          data-testid={`cell-${row.slug}-sep-${sep}`}
                          className="px-4 py-4 text-center whitespace-nowrap"
                        >
                          <span className="sr-only">
                            {row.name} SEP-{sep}: {cell?.label ?? "Unknown/unavailable"}
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

          {/* Narrow-screen / Mobile Alternative Card Stack */}
          <div className="space-y-4 md:hidden" aria-label="Mobile anchor capability cards">
            <h3 className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Anchor capability summary (mobile view)
            </h3>
            {rows.map((row) => (
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
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--ghost)]">
                  {seps.map((sep) => {
                    const cell = row.capabilities[sep];
                    const isAdv = cell?.state === "advertised";
                    return (
                      <span
                        key={`m-${sep}`}
                        className={`text-xs px-2 py-1 rounded border ${
                          isAdv
                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                            : "border-[rgba(255,255,255,0.14)] text-[var(--muted)] bg-[var(--ghost)]"
                        }`}
                      >
                        SEP-{sep}: {cell?.state === "advertised" ? "Advertised" : "No"}
                      </span>
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
