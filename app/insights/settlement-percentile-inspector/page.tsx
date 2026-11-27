import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getReputationApiResult } from "@/lib/api/reputation";
import { parseReputationList } from "./InspectorClient";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Settlement percentile inspector — StellarCore",
  description:
    "Inspect reported settleP50Ms and settleP95Ms from public reputation responses for reviewed anchors. Shows the arithmetic p95 minus p50 spread and labels inconsistent percentile ordering. No database, API, credential, SEP network, settlement, firm-quote or reputation calculation changes.",
};

function PageShell({
  children,
  title,
  description,
}: Readonly<{
  children: React.ReactNode;
  title: string;
  description: string;
}>) {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link
              href="/dashboard"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              Dashboard
            </Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">{title}</span>
          </nav>
          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Settlement percentile evidence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              {title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {description}
            </p>
          </header>
          {children}
        </div>
      </main>
    </>
  );
}

/** Format milliseconds to a human-readable string, or show N/A for null. */
function formatMs(value: number | null): string {
  if (value === null) return "N/A";
  if (value === 0) return "0 ms";
  return `${value} ms`;
}

export default async function SettlementPercentileInspectorPage() {
  const listResult = await getReputationApiResult();

  if (listResult.status !== 200) {
    return (
      <PageShell
        title="Settlement percentile inspector — StellarCore"
        description="Inspect reported settleP50Ms and settleP95Ms from public reputation responses for reviewed anchors."
      >
        <div
          role="alert"
          data-evidence-state="unavailable"
          data-inspector-state="list-unavailable"
          className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Unavailable<span className="sr-only">: </span>
          </p>
          <p className="mt-2">
            Unable to load reputation:{" "}
            {listResult.body?.error?.message ?? "unknown error"}
          </p>
          <p className="mt-1">
            Select a reviewed corridor or anchor to inspect settlement percentiles.
          </p>
        </div>
      </PageShell>
    );
  }

  const parsed = parseReputationList(listResult.body);

  if (!parsed || !parsed.entries.length) {
    return (
      <PageShell
        title="Settlement percentile inspector — StellarCore"
        description="Inspect reported settleP50Ms and settleP95Ms from public reputation responses for reviewed anchors."
      >
        <div
          role="alert"
          data-evidence-state="empty"
          data-inspector-state="no-data"
          className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            No data<span className="sr-only">: </span>
          </p>
          <p className="mt-2">No reputation entries found.</p>
          <p className="mt-1">
            Select a reviewed corridor or anchor to inspect settlement percentiles.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Settlement percentile inspector — StellarCore"
      description="Inspect reported settleP50Ms and settleP95Ms from public reputation responses for reviewed anchors."
    >
      <div className="mt-8">
        {parsed.entries.map((entry) => (
          <section
            key={entry.anchor.slug}
            aria-label={`Settlement percentile evidence for ${entry.anchor.slug}`}
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                className="text-lg text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {entry.anchor.name}
              </h2>
              <span
                className="rounded-full border border-[var(--ghost)] px-2 py-1 text-xs uppercase tracking-wide text-[var(--muted)]"
              >
                {entry.state}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Evidence: {entry.evidence?.outcomeCount ?? 0} outcomes
            </p>
            <div className="mt-3">
              <p className="font-medium">P50 settleMs:</p>
              <p className="mt-1">{formatMs(entry.metrics?.settleP50Ms ?? null)}</p>
              <p className="font-medium">P95 settleMs:</p>
              <p className="mt-1">{formatMs(entry.metrics?.settleP95Ms ?? null)}</p>
              {entry.metrics?.settleP95Ms != null &&
                entry.metrics?.settleP50Ms != null && (
                <p className="mt-3 text-sm">
                  <strong>
                    {entry.metrics.settleP95Ms < entry.metrics.settleP50Ms ? (
                      "Inconsistent percentile ordering observed"
                    ) : (
                      `Spread: ${formatMs(
                        entry.metrics.settleP95Ms - entry.metrics.settleP50Ms,
                      )}`
                    )}
                  </strong>
                </p>
              )}
            </div>
            <EvidenceTimestamp value={entry.computedAt} />
          </section>
        ))}
      </div>
    </PageShell>
  );
}