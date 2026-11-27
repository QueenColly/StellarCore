"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  CountryRole,
  CountrySummary,
  ReviewedGeographyIndex,
} from "./geography";

export type GeographyViewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; index: ReviewedGeographyIndex }>;

export function GeographyView({ state }: { state: GeographyViewState }) {
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<"all" | CountryRole>("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (state.kind === "loading") {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
        <p role="status">Loading reviewed corridor geography from directory...</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="mt-8 rounded-lg border border-red-500/40 bg-red-950/20 p-6 text-red-200"
      >
        <h2 className="text-lg font-semibold text-red-100">Unable to load corridor geography</h2>
        <p className="mt-2 text-sm">{state.message}</p>
        <p className="mt-4 text-xs text-red-300">
          The public corridors endpoint may be unreachable or returned an unexpected format.
        </p>
      </div>
    );
  }

  const { index } = state;

  if (index.totalCorridorsLoaded === 0) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
        <p>No reviewed corridors were returned by the directory endpoint.</p>
      </div>
    );
  }

  const filteredCountries = index.countries.filter((c) => {
    if (filterRole !== "all" && c.role !== filterRole) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.countryCode.toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q)
    );
  });

  const activeCountry: CountrySummary | undefined =
    selectedCountryCode
      ? index.countries.find((c) => c.countryCode === selectedCountryCode)
      : filteredCountries[0] || index.countries[0];

  return (
    <div className="mt-8 space-y-8">
      {/* Scope and Non-Live Disclaimer */}
      <section
        aria-labelledby="geography-scope-heading"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm"
      >
        <h2 id="geography-scope-heading" className="font-semibold text-[var(--white)]">
          Directory Scope & Evidence Boundary
        </h2>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">
          This explorer analyzes <strong>{index.totalCorridorsLoaded} reviewed corridor records</strong> returned
          by the public directory endpoint. It highlights which country codes appear as sending sources or receiving
          destinations in reviewed configurations.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          <strong>Notice:</strong> Reviewed presence does <em>not</em> represent real-time corridor availability,
          settlement execution, operational provider uptime, transfer quotes, or regulatory coverage. Associated
          anchor counts represent registry metadata, not unique or guaranteed active market participants.
        </p>
      </section>

      {/* Aggregate Counts Summary */}
      <section aria-labelledby="geography-summary-heading" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <h2 id="geography-summary-heading" className="sr-only">
          Corridor Geography Summary Statistics
        </h2>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Unique Countries</p>
          <p className="mt-1 text-2xl font-bold text-[var(--white)]">{index.uniqueCountriesCount}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{index.bothRolesCountriesCount} two-way / {index.sourceOnlyCountriesCount + index.destinationOnlyCountriesCount} one-way</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Reviewed Corridors</p>
          <p className="mt-1 text-2xl font-bold text-[var(--white)]">{index.totalCorridorsLoaded}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Across all active pairs</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Cross-Border Pairs</p>
          <p className="mt-1 text-2xl font-bold text-[var(--white)]">{index.crossBorderCorridorsCount}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Source ≠ Destination</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Domestic Pairs</p>
          <p className="mt-1 text-2xl font-bold text-[var(--white)]">{index.domesticCorridorsCount}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Source = Destination</p>
        </div>
      </section>

      {/* Main Explorer Panel */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Country Selector / Filter Column */}
        <div className="space-y-4 lg:col-span-5">
          <div className="space-y-3">
            <label htmlFor="country-search-input" className="block text-sm font-medium text-[var(--white)]">
              Search Countries
            </label>
            <input
              id="country-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code or name..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--black)] px-3 py-2 text-sm text-[var(--white)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter countries by corridor role">
            {(
              [
                { id: "all", label: "All" },
                { id: "both", label: "Both Roles" },
                { id: "source_only", label: "Source Only" },
                { id: "destination_only", label: "Dest Only" },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFilterRole(filter.id)}
                aria-pressed={filterRole === filter.id}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterRole === filter.id
                    ? "bg-[var(--accent)] text-black"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--white)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <nav aria-label="Reviewed Countries List" className="max-h-[500px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {filteredCountries.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--muted)]">No matching countries found.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {filteredCountries.map((c) => {
                  const isSelected = activeCountry?.countryCode === c.countryCode;
                  return (
                    <li key={c.countryCode}>
                      <button
                        type="button"
                        onClick={() => setSelectedCountryCode(c.countryCode)}
                        aria-current={isSelected ? "true" : undefined}
                        className={`flex w-full items-center justify-between p-3 text-left transition-colors ${
                          isSelected
                            ? "bg-[var(--surface-hover)] font-medium text-[var(--white)] ring-1 ring-inset ring-[var(--accent)]"
                            : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--white)]"
                        }`}
                      >
                        <div>
                          <span className="font-mono text-sm font-semibold">{c.countryCode}</span>
                          <span className="ml-2 text-xs text-[var(--muted)]">{c.displayName}</span>
                        </div>
                        <span className="rounded bg-[var(--black)] px-2 py-0.5 text-xs text-[var(--muted)]">
                          {c.totalUniqueCorridors} {c.totalUniqueCorridors === 1 ? "pair" : "pairs"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </div>

        {/* Selected Country Details Column */}
        <div className="lg:col-span-7">
          {activeCountry ? (
            <div className="space-y-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
              <header className="border-b border-[var(--border)] pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold text-[var(--white)]">
                    {activeCountry.displayName}
                  </h3>
                  <span
                    className={`rounded px-2.5 py-0.5 text-xs font-semibold ${
                      activeCountry.role === "both"
                        ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50"
                        : activeCountry.role === "source_only"
                        ? "bg-blue-950/40 text-blue-300 border border-blue-800/50"
                        : "bg-purple-950/40 text-purple-300 border border-purple-800/50"
                    }`}
                  >
                    {activeCountry.role === "both"
                      ? "Source & Destination"
                      : activeCountry.role === "source_only"
                      ? "Source Role Only"
                      : "Destination Role Only"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Present in {activeCountry.totalUniqueCorridors} unique reviewed corridor configuration
                  {activeCountry.totalUniqueCorridors === 1 ? "" : "s"} ({activeCountry.sourceCorridors.length} as source, {activeCountry.destinationCorridors.length} as destination).
                </p>
              </header>

              {/* Sending Side (Source) Corridors */}
              <section aria-labelledby="source-corridors-heading">
                <h4 id="source-corridors-heading" className="text-sm font-semibold text-[var(--white)]">
                  Sending Side ({activeCountry.countryCode} as Source)
                </h4>
                {activeCountry.sourceCorridors.length === 0 ? (
                  <p className="mt-2 text-xs italic text-[var(--muted)]">
                    No reviewed corridors have {activeCountry.countryCode} configured as source.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                          <th className="py-2 pr-3 font-medium">Corridor Pair</th>
                          <th className="py-2 pr-3 font-medium">Destination</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 font-medium">Reviewed Anchors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {activeCountry.sourceCorridors.map((c) => (
                          <tr key={`src-${c.slug}`} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 pr-3 font-mono">
                              <Link
                                href={`/corridors/${encodeURIComponent(c.slug)}`}
                                className="text-[var(--accent)] underline hover:text-[var(--white)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                              >
                                {c.sourceAsset} → {c.destinationAsset}
                              </Link>
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--muted)]">
                              {c.destinationCountry}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  c.isDomestic ? "bg-amber-950/40 text-amber-300" : "bg-neutral-800 text-neutral-300"
                                }`}
                              >
                                {c.isDomestic ? "Domestic" : "Cross-Border"}
                              </span>
                            </td>
                            <td className="py-2.5 text-[var(--muted)]">{c.anchorCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Receiving Side (Destination) Corridors */}
              <section aria-labelledby="dest-corridors-heading">
                <h4 id="dest-corridors-heading" className="text-sm font-semibold text-[var(--white)]">
                  Receiving Side ({activeCountry.countryCode} as Destination)
                </h4>
                {activeCountry.destinationCorridors.length === 0 ? (
                  <p className="mt-2 text-xs italic text-[var(--muted)]">
                    No reviewed corridors have {activeCountry.countryCode} configured as destination.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                          <th className="py-2 pr-3 font-medium">Corridor Pair</th>
                          <th className="py-2 pr-3 font-medium">Source</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 font-medium">Reviewed Anchors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {activeCountry.destinationCorridors.map((c) => (
                          <tr key={`dst-${c.slug}`} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 pr-3 font-mono">
                              <Link
                                href={`/corridors/${encodeURIComponent(c.slug)}`}
                                className="text-[var(--accent)] underline hover:text-[var(--white)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                              >
                                {c.sourceAsset} → {c.destinationAsset}
                              </Link>
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--muted)]">
                              {c.sourceCountry}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  c.isDomestic ? "bg-amber-950/40 text-amber-300" : "bg-neutral-800 text-neutral-300"
                                }`}
                              >
                                {c.isDomestic ? "Domestic" : "Cross-Border"}
                              </span>
                            </td>
                            <td className="py-2.5 text-[var(--muted)]">{c.anchorCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              Select a country from the left to view reviewed corridors.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
