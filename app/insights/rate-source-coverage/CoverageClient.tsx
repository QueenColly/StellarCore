"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRatesPath,
  parseCorridorOptions,
  parseRatesBody,
  readApiErrorMessage,
  type CoverageCorridorOption,
} from "./coverage";
import { CoverageView, type CoverageViewState } from "./CoverageView";

type CorridorListState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; options: readonly CoverageCorridorOption[] }>;

const REQUEST_INIT: RequestInit = Object.freeze({
  method: "GET",
  credentials: "omit",
  cache: "no-store",
  redirect: "error",
  headers: { Accept: "application/json" },
});

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Loads the corridor list once, then fetches `/api/rates` once per explicit
 * selection. There is no polling; a reader re-selects to refresh.
 */
export function CoverageClient() {
  const [corridors, setCorridors] = useState<CorridorListState>({ kind: "loading" });
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<CoverageViewState>({ kind: "idle" });
  const ratesController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/corridors", { ...REQUEST_INIT, signal: controller.signal });
        const body = await readJson(response);
        if (!response.ok) {
          setCorridors({ kind: "error", message: readApiErrorMessage(body) ?? `Corridors request failed (HTTP ${response.status}).` });
          return;
        }
        const options = parseCorridorOptions(body);
        if (options === null) {
          setCorridors({ kind: "error", message: "The corridors response could not be read." });
          return;
        }
        setCorridors({ kind: "ready", options });
      } catch {
        if (!controller.signal.aborted) {
          setCorridors({ kind: "error", message: "Network error while loading corridors." });
        }
      }
    })();
    return () => {
      controller.abort();
      ratesController.current?.abort();
    };
  }, []);

  async function loadRates(slug: string, options: readonly CoverageCorridorOption[]) {
    ratesController.current?.abort();
    const path = buildRatesPath(slug, options);
    if (path === null) {
      setView({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    ratesController.current = controller;
    setView({ kind: "loading" });
    try {
      const response = await fetch(path, { ...REQUEST_INIT, signal: controller.signal });
      const body = await readJson(response);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setView({ kind: "error", message: readApiErrorMessage(body) ?? `Rates request failed (HTTP ${response.status}).` });
        return;
      }
      const rates = parseRatesBody(body, response.headers.get("x-evidence-state"));
      setView(rates === null
        ? { kind: "error", message: "The rates response could not be read." }
        : { kind: "ready", rates });
    } catch {
      if (!controller.signal.aborted) {
        setView({ kind: "error", message: "Network error while loading rate evidence." });
      }
    }
  }

  return (
    <div className="mt-8">
      <div className="max-w-md">
        <label htmlFor="coverage-corridor" className="block text-xs uppercase tracking-wide text-[var(--muted)]">
          Corridor
        </label>
        {corridors.kind === "error" ? (
          <p role="alert" className="mt-2 text-sm text-[#ee8f81]">{corridors.message}</p>
        ) : (
          <select
            id="coverage-corridor"
            className="mt-1 w-full rounded-md border border-[var(--ghost)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selected}
            disabled={corridors.kind !== "ready" || corridors.options.length === 0}
            aria-describedby="coverage-corridor-hint"
            onChange={(event) => {
              const slug = event.target.value;
              setSelected(slug);
              if (corridors.kind === "ready") void loadRates(slug, corridors.options);
            }}
          >
            <option value="">
              {corridors.kind === "loading"
                ? "Loading corridors…"
                : corridors.options.length === 0
                  ? "No reviewed corridors available"
                  : "Select a corridor"}
            </option>
            {corridors.kind === "ready" && corridors.options.map((option) => (
              <option key={option.slug} value={option.slug}>{option.label}</option>
            ))}
          </select>
        )}
        <p id="coverage-corridor-hint" className="mt-2 text-xs text-[var(--muted)]">
          Options come from the read-only /api/corridors response. Each selection sends one GET to /api/rates; nothing polls.
        </p>
      </div>

      <section className="mt-6" aria-live="polite" aria-label="Rate-source coverage">
        <CoverageView state={view} />
      </section>
    </div>
  );
}
