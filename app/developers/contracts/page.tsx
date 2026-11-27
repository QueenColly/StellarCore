"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  ALLOWLISTED_FIXTURES,
  DOMAINS,
  type ContractDomain,
  type ContractFixture,
  type FixtureResponseState,
} from "./fixtures";

export default function ContractsBrowserPage() {
  const [selectedDomain, setSelectedDomain] = useState<ContractDomain | "all">("all");
  const [selectedState, setSelectedState] = useState<FixtureResponseState | "all">("all");
  const [selectedFixtureName, setSelectedFixtureName] = useState<string>(
    ALLOWLISTED_FIXTURES[0]?.name ?? "",
  );
  const [copied, setCopied] = useState(false);
  const [minified, setMinified] = useState(false);
  const domainFilterId = useId();
  const stateFilterId = useId();

  // Filter fixtures safely from static compile-time allowlist only
  const filteredFixtures = useMemo(() => {
    return ALLOWLISTED_FIXTURES.filter((fixture) => {
      if (selectedDomain !== "all" && fixture.domain !== selectedDomain) {
        return false;
      }
      if (selectedState !== "all" && fixture.responseState !== selectedState) {
        return false;
      }
      return true;
    });
  }, [selectedDomain, selectedState]);

  // Selected fixture lookup (restricted strictly to allowlist)
  const currentFixture = useMemo(() => {
    const found = filteredFixtures.find((f) => f.name === selectedFixtureName);
    return found ?? filteredFixtures[0] ?? ALLOWLISTED_FIXTURES[0];
  }, [filteredFixtures, selectedFixtureName]);

  const jsonText = useMemo(() => {
    if (!currentFixture) return "";
    return minified
      ? JSON.stringify(currentFixture.body)
      : JSON.stringify(currentFixture.body, null, 2);
  }, [currentFixture, minified]);

  const handleCopy = async () => {
    if (!jsonText) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadgeColor = (status: number) => {
    if (status >= 500) return "bg-red-950/60 text-red-300 border-red-800";
    if (status >= 400) return "bg-amber-950/60 text-amber-300 border-amber-800";
    return "bg-emerald-950/60 text-emerald-300 border-emerald-800";
  };

  const getStateBadgeColor = (state: FixtureResponseState) => {
    switch (state) {
      case "success":
        return "bg-emerald-950/40 text-emerald-300 border-emerald-800";
      case "empty":
        return "bg-blue-950/40 text-blue-300 border-blue-800";
      case "insufficient_evidence":
        return "bg-purple-950/40 text-purple-300 border-purple-800";
      case "invalid_input":
      case "not_found":
        return "bg-amber-950/40 text-amber-300 border-amber-800";
      case "server_error":
        return "bg-red-950/40 text-red-300 border-red-800";
      default:
        return "bg-zinc-800 text-zinc-300 border-zinc-700";
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--muted)]">
          <Link
            href="/dashboard"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Dashboard
          </Link>
          <span aria-hidden="true" className="px-2">/</span>
          <Link
            href="/developers/explorer"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Developers
          </Link>
          <span aria-hidden="true" className="px-2">/</span>
          <span aria-current="page" className="text-[var(--white)]">Contracts Fixture Browser</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[var(--accent)]">
                Developer Experience
              </p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
                Public API v1 Contract Fixtures
              </h1>
            </div>
            <div
              role="note"
              aria-label="Offline Mode Indicator"
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
            >
              Offline Fixture Reference • 31 Bundled Samples
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            Explore offline response structures for public API v1 endpoints. Covers success states,
            empty directories, insufficient-evidence fallbacks, and deterministic error responses.
          </p>
        </header>

        {/* Synthetic Contract Example Warning Notice */}
        <div
          role="note"
          aria-label="Synthetic Contract Example Notice"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-200"
        >
          <strong className="font-semibold text-amber-100">Synthetic Contract Example:</strong>{" "}
          All fixtures displayed here are committed static API v1 contract test samples. They illustrate
          response structures and JSON field typings for developers. They are not live production evidence
          and do not reflect real-time operational uptime or live anchor status.
        </div>

        {/* Filter Toolbar */}
        <section aria-label="Fixture filters" className="mt-6 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={domainFilterId} className="text-xs font-medium text-[var(--muted)]">
              Domain:
            </label>
            <select
              id={domainFilterId}
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value as ContractDomain | "all")}
              aria-label="Filter fixtures by domain"
              className="rounded-md border border-[var(--border)] bg-zinc-900 px-3 py-1.5 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="all">All Domains ({ALLOWLISTED_FIXTURES.length})</option>
              {DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain.charAt(0).toUpperCase() + domain.slice(1)} (
                  {ALLOWLISTED_FIXTURES.filter((f) => f.domain === domain).length})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={stateFilterId} className="text-xs font-medium text-[var(--muted)]">
              Response State:
            </label>
            <select
              id={stateFilterId}
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value as FixtureResponseState | "all")}
              aria-label="Filter fixtures by response state"
              className="rounded-md border border-[var(--border)] bg-zinc-900 px-3 py-1.5 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="all">All States</option>
              <option value="success">Success</option>
              <option value="empty">Empty Result</option>
              <option value="insufficient_evidence">Insufficient Evidence</option>
              <option value="invalid_input">Invalid Input (400)</option>
              <option value="not_found">Not Found (404)</option>
              <option value="server_error">Server Error (500)</option>
            </select>
          </div>

          <div className="ml-auto text-xs text-[var(--muted)]">
            Showing {filteredFixtures.length} fixture{filteredFixtures.length === 1 ? "" : "s"}
          </div>
        </section>

        {/* Master-Detail Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Fixture Selector Sidebar */}
          <nav
            aria-label="Contract Fixture List"
            className="lg:col-span-5 max-h-[640px] overflow-y-auto rounded-xl border border-[var(--border)] bg-zinc-950/60 p-2"
          >
            {filteredFixtures.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--muted)]">
                No contract fixtures match the selected filter criteria.
              </p>
            ) : (
              <ul className="space-y-1.5" role="list">
                {filteredFixtures.map((fixture) => {
                  const isSelected = currentFixture?.name === fixture.name;
                  return (
                    <li key={fixture.name}>
                      <button
                        type="button"
                        onClick={() => setSelectedFixtureName(fixture.name)}
                        aria-current={isSelected ? "true" : undefined}
                        className={`w-full text-left rounded-lg p-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                          isSelected
                            ? "bg-zinc-800/90 border border-zinc-600 text-white shadow-sm"
                            : "hover:bg-zinc-900 border border-transparent text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-white truncate">
                            {fixture.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getStatusBadgeColor(
                              fixture.expectedStatus,
                            )}`}
                          >
                            {fixture.expectedStatus}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                          <span className="truncate">{fixture.endpoint}</span>
                          <span
                            className={`capitalize text-[10px] px-1 py-0.2 rounded border ${getStateBadgeColor(
                              fixture.responseState,
                            )}`}
                          >
                            {fixture.responseState.replace("_", " ")}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Fixture Detail Viewer */}
          <section
            aria-labelledby="fixture-detail-heading"
            className="lg:col-span-7 flex flex-col rounded-xl border border-[var(--border)] bg-zinc-950/80 p-5"
          >
            {currentFixture ? (
              <>
                <header className="border-b border-[var(--border)] pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id="fixture-detail-heading"
                      className="text-base font-semibold text-[var(--white)] font-mono"
                    >
                      {currentFixture.name}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-amber-800/80 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                        Synthetic Contract Example
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-mono ${getStatusBadgeColor(
                          currentFixture.expectedStatus,
                        )}`}
                      >
                        HTTP {currentFixture.expectedStatus}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
                    {currentFixture.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-300">
                    <div>
                      <span className="text-[var(--muted)]">Endpoint: </span>
                      <code className="text-emerald-300">{currentFixture.endpoint}</code>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">Method: </span>
                      <code className="text-cyan-300">{currentFixture.method}</code>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">Domain: </span>
                      <span className="capitalize text-zinc-200">{currentFixture.domain}</span>
                    </div>
                  </div>
                </header>

                {/* Response Body & Copy Toolbar */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-[var(--muted)]">
                    Response Payload (JSON):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMinified((m) => !m)}
                      aria-label={minified ? "Expand JSON indentation" : "Minify JSON"}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2"
                    >
                      {minified ? "Expand" : "Minify"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      aria-label="Copy fixture JSON to clipboard"
                      className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 font-medium"
                    >
                      {copied ? "Copied!" : "Copy JSON"}
                    </button>
                  </div>
                </div>

                {/* Preformatted JSON */}
                <div className="mt-2 flex-1 overflow-x-auto rounded-lg border border-zinc-800 bg-[var(--black)] p-4">
                  <pre
                    tabIndex={0}
                    aria-label="Formatted fixture response JSON"
                    className="text-xs font-mono text-zinc-200 whitespace-pre leading-relaxed focus-visible:outline-2"
                  >
                    <code>{jsonText}</code>
                  </pre>
                </div>
              </>
            ) : (
              <p className="p-8 text-center text-sm text-[var(--muted)]">
                Select a fixture from the sidebar to inspect its JSON contract.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
