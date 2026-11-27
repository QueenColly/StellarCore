"use client";

import { useState } from "react";
import Link from "next/link";
import {
  exportDirectoryAsCsv,
  type DirectoryType,
} from "@/lib/directoryCsv";

export default function DirectoryExportPage() {
  const [selectedType, setSelectedType] = useState<DirectoryType>("anchors");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    filename: string;
    total: number;
    isPartial: boolean;
    preview: string;
  } | null>(null);

  const handleExport = async (type: DirectoryType) => {
    setSelectedType(type);
    setLoading(true);
    setError(null);
    setSuccessInfo(null);

    try {
      const result = await exportDirectoryAsCsv(type);
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Trigger browser download via Blob
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", result.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const previewLines = result.csv.split("\r\n").slice(0, 5).join("\n");
      setSuccessInfo({
        filename: result.filename,
        total: result.totalRetrieved,
        isPartial: result.isPartial,
        preview: previewLines,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during export";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[var(--muted)]">
          <Link
            href="/dashboard"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Dashboard
          </Link>
          <span aria-hidden="true" className="px-2">/</span>
          <span aria-current="page" className="text-[var(--white)]">Directory Export</span>
        </nav>

        <header>
          <p className="text-xs font-semibold tracking-wider uppercase text-[var(--accent)]">
            Data Usability
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Export Reviewed Directories as CSV
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            Save a safe, human-readable CSV copy of reviewed anchor and corridor listings
            directly from public GET list APIs. Formatted deterministically with formula injection defense.
          </p>
        </header>

        {/* Sync Status Label Disclaimer */}
        <div
          role="note"
          aria-label="Sync status definition disclaimer"
          className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs leading-relaxed text-[var(--muted)]"
        >
          <strong className="font-semibold text-[var(--white)]">Sync Status Definition:</strong>{" "}
          A sync status reflects the last recorded metadata synchronization with registry records.
          It is explicitly not an indicator of live operational uptime or service reliability.
        </div>

        {/* Directory Selection Tabs / Cards */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {/* Anchors Directory Card */}
          <section
            aria-labelledby="anchors-export-heading"
            className={`rounded-xl border p-6 transition-colors ${
              selectedType === "anchors"
                ? "border-[var(--accent)] bg-[var(--surface)]"
                : "border-[var(--border)] bg-[var(--surface-subtle)]"
            }`}
          >
            <h2 id="anchors-export-heading" className="text-xl font-semibold text-[var(--white)]">
              Anchor Directory
            </h2>
            <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
              Export reviewed anchors with identifiers, home domains, advertised SEPs, last persisted sync status, and corridor counts.
            </p>
            <dl className="mt-4 text-xs text-[var(--muted)] space-y-1">
              <div><dt className="inline font-medium text-[var(--white)]">Fields: </dt><dd className="inline">Slug, Name, Home Domain, Last Persisted Sync Status, Advertised SEPs, Advertised Transfer Interface, Corridor Count</dd></div>
              <div><dt className="inline font-medium text-[var(--white)]">Safety limit: </dt><dd className="inline">Capped at 1,000 items per export</dd></div>
            </dl>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => handleExport("anchors")}
                disabled={loading}
                aria-busy={loading && selectedType === "anchors"}
                aria-label="Export reviewed anchors as safe CSV"
                className="w-full rounded-md bg-[var(--white)] px-4 py-2.5 text-sm font-semibold text-[var(--black)] shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--white)] disabled:opacity-50"
              >
                {loading && selectedType === "anchors"
                  ? "Exporting Anchors..."
                  : "Export Anchors CSV"}
              </button>
            </div>
          </section>

          {/* Corridors Directory Card */}
          <section
            aria-labelledby="corridors-export-heading"
            className={`rounded-xl border p-6 transition-colors ${
              selectedType === "corridors"
                ? "border-[var(--accent)] bg-[var(--surface)]"
                : "border-[var(--border)] bg-[var(--surface-subtle)]"
            }`}
          >
            <h2 id="corridors-export-heading" className="text-xl font-semibold text-[var(--white)]">
              Corridor Directory
            </h2>
            <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
              Export reviewed remittance corridors with corridor slug, asset pairings, country codes, and supporting anchor counts.
            </p>
            <dl className="mt-4 text-xs text-[var(--muted)] space-y-1">
              <div><dt className="inline font-medium text-[var(--white)]">Fields: </dt><dd className="inline">Slug, Source Asset, Source Country, Destination Asset, Destination Country, Anchor Count</dd></div>
              <div><dt className="inline font-medium text-[var(--white)]">Safety limit: </dt><dd className="inline">Capped at 1,000 items per export</dd></div>
            </dl>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => handleExport("corridors")}
                disabled={loading}
                aria-busy={loading && selectedType === "corridors"}
                aria-label="Export reviewed corridors as safe CSV"
                className="w-full rounded-md bg-[var(--white)] px-4 py-2.5 text-sm font-semibold text-[var(--black)] shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--white)] disabled:opacity-50"
              >
                {loading && selectedType === "corridors"
                  ? "Exporting Corridors..."
                  : "Export Corridors CSV"}
              </button>
            </div>
          </section>
        </div>

        {/* Live Status and Output */}
        <section aria-live="polite" className="mt-8">
          {loading && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]"
            >
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--white)] border-t-transparent"
                aria-hidden="true"
              />
              <span>Paginating public API and generating safe CSV export...</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/50 bg-red-950/20 p-4 text-sm text-red-200"
            >
              <strong className="font-semibold">Export Error: </strong>
              <span>{error}</span>
            </div>
          )}

          {successInfo && (
            <div
              role="status"
              className="rounded-lg border border-emerald-500/50 bg-emerald-950/20 p-4 text-sm text-emerald-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-emerald-100">
                  Export ready: {successInfo.filename}
                </span>
                <span className="text-xs text-emerald-300">
                  {successInfo.total} record{successInfo.total === 1 ? "" : "s"} exported
                </span>
              </div>

              {successInfo.isPartial && (
                <p className="mt-2 text-xs text-amber-300">
                  ⚠️ Note: Export reached the safety pagination limit. Results may be partial.
                </p>
              )}

              {successInfo.total === 0 && (
                <p className="mt-2 text-xs text-emerald-300">
                  No records were returned by the directory API. An empty table with headers was generated.
                </p>
              )}

              <div className="mt-3">
                <p className="text-xs font-mono text-[var(--muted)]">CSV Header Preview:</p>
                <pre className="mt-1 overflow-x-auto rounded bg-[var(--black)] p-2 text-xs font-mono text-[var(--white)]">
                  {successInfo.preview}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
