import { Metadata } from "next";
import { getAnchorsApiResult } from "@/lib/api/anchors";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SEPS } from "@/constants/seps";
import { advertisedCapabilities } from "@/lib/stellar/advertisedCapabilities";
import type { PublicAnchorStatus } from "@/types/api/anchors";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionError } from "@/components/dashboard/SectionStates";

const STATUS_LABELS: Record<PublicAnchorStatus, string> = {
  LIVE: "Last sync successful",
  DEGRADED: "Last sync degraded",
  DOWN: "Last sync failed",
  UNKNOWN: "Last sync unknown",
};

const STATUS_TONES: Record<PublicAnchorStatus, "positive" | "warning" | "negative" | "neutral"> = {
  LIVE: "positive",
  DEGRADED: "warning",
  DOWN: "negative",
  UNKNOWN: "neutral",
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monitoring — StellarCore",
  description:
    "Persisted anchor synchronization status. These statuses reflect the last SEP-1 synchronization result, not real-time endpoint health.",
};

export default async function MonitoringPage() {
  const result = await getAnchorsApiResult();

  if (result.status !== 200) {
    return <SectionError message={result.body.error.message} />;
  }

  const { anchors, count } = result.body;

  if (count === 0) {
    return <SectionEmpty message="No anchors are currently persisted." />;
  }

  const statusCounts = {
    LIVE: 0,
    DEGRADED: 0,
    DOWN: 0,
    UNKNOWN: 0,
  };

  anchors.forEach((anchor) => {
    statusCounts[anchor.status as keyof typeof statusCounts]++;
  });

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
          <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
            Dashboard
          </Link>
          <span aria-hidden="true" className="px-2">/</span>
          <span aria-current="page">Monitoring</span>
        </nav>

        <header className="mt-8 max-w-3xl">
          <p className="eyebrow">Persisted sync status</p>
          <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
            Anchor synchronization overview
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            These statuses reflect the last persisted SEP-1 synchronization result for each anchor.
            They do not represent real-time endpoint health, financial reliability, or transfer success.
          </p>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(statusCounts).map(
            ([status, count]) => {
              const tone = STATUS_TONES[status as keyof typeof STATUS_TONES];
              return (
                <div
                  key={status}
                  className={`rounded-lg border p-6 border-[var(--ghost)] ${tone === "positive" ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" : tone === "warning" ? "bg-[rgba(243,184,100,0.14)]" : tone === "negative" ? "bg-[rgba(238,143,129,0.14)]" : "bg-[var(--ghost)]"} ${tone === "positive" ? "text-[var(--accent)]" : tone === "warning" ? "text-[#f3b864]" : tone === "negative" ? "text-[#ee8f81]" : "text-[var(--muted)]"}`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide whitespace-nowrap">{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</p>
                  <p className="text-4xl font-bold">{count}</p>
                  <p className="text-xs mt-1">{count} {count === 1 ? "anchor" : "anchors"}</p>
                </div>
              );
            },
          )}
        </div>

        <div className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Anchor detail pages
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Click an anchor name below to view its detailed persisted synchronization state, SEP disclosures, and associated corridors.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {anchors.map((anchor) => (
            <Link
              key={anchor.slug}
              href={`/anchors/${anchor.slug}`}
              className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              <h3 className="text-lg text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>
                {anchor.name}
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {anchor.homeDomain}
              </p>
              <Badge tone="neutral" label={anchor.isTransferCapable ? "Transfer interface advertised" : "No transfer interface advertised"} />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}