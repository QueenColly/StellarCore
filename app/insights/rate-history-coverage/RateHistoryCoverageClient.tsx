"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRateHistoryPath,
  parseCorridorOptions,
  parseRateHistoryBody,
  readApiErrorMessage,
  SUPPORTED_WINDOWS,
  DEFAULT_WINDOW,
  type CoverageCorridorOption,
  type SupportedWindow,
} from "./coverage";
import {
  RateHistoryCoverageView,
  type RateHistoryCoverageViewState,
} from "./RateHistoryCoverageView";

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
 * Loads the corridor list once, then fetches `/api/rates/history` on explicit selection.
 * There is no background polling; a user selects a corridor or window to fetch.
 */
export function RateHistoryCoverageClient() {
  const [corridors, setCorridors] = useState<CorridorListState>({ kind: "loading" });
  const [selectedCorridor, setSelectedCorridor] = useState("");
  const [selectedWindow, setSelectedWindow] = useState<SupportedWindow>(DEFAULT_WINDOW);
  const [view, setView] = useState<RateHistoryCoverageViewState>({ kind: "idle" });
  const historyController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/corridors", {
          ...REQUEST_INIT,
          signal: controller.signal,
        });
        const body = await readJson(response);
        if (!response.ok) {
          setCorridors({
            kind: "error",
            message:
              readApiErrorMessage(body) ??
              `Corridors request failed (HTTP ${response.status}).`,
          });
          return;
        }
        const options = parseCorridorOptions(body);
        if (options === null) {
          setCorridors({
            kind: "error",
            message: "The corridors response could not be read.",
          });
          return;
        }
        setCorridors({ kind: "ready", options });
      } catch {
        if (!controller.signal.aborted) {
          setCorridors({
            kind: "error",
            message: "Network error while loading corridors.",
          });
        }
      }
    })();
    return () => {
      controller.abort();
      historyController.current?.abort();
    };
  }, []);

  async function loadRateHistory(
    slug: string,
    days: SupportedWindow,
    options: readonly CoverageCorridorOption[],
  ) {
    historyController.current?.abort();
    const path = buildRateHistoryPath(slug, days, options);
    if (path === null) {
      setView({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    historyController.current = controller;
    setView({ kind: "loading" });
    try {
      const response = await fetch(path, {
        ...REQUEST_INIT,
        signal: controller.signal,
      });
      const body = await readJson(response);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setView({
          kind: "error",
          message:
            readApiErrorMessage(body) ??
            `Rate history request failed (HTTP ${response.status}).`,
        });
        return;
      }
      const history = parseRateHistoryBody(
        body,
        response.headers.get("x-evidence-state"),
      );
      setView(
        history === null
          ? { kind: "error", message: "The rate history response could not be read." }
          : { kind: "ready", history },
      );
    } catch {
      if (!controller.signal.aborted) {
        setView({
          kind: "error",
          message: "Network error while loading rate history evidence.",
        });
      }
    }
  }

  function handleCorridorChange(slug: string) {
    setSelectedCorridor(slug);
    if (corridors.kind === "ready") {
      loadRateHistory(slug, selectedWindow, corridors.options);
    }
  }

  function handleWindowChange(days: SupportedWindow) {
    setSelectedWindow(days);
    if (corridors.kind === "ready" && selectedCorridor) {
      loadRateHistory(selectedCorridor, days, corridors.options);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Controls panel */}
      <section
        aria-labelledby="controls-heading"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
      >
        <h2 id="controls-heading" className="sr-only">
          Corridor and Lookback Window Controls
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {/* Corridor dropdown */}
          <div className="flex-1 max-w-md">
            <label
              htmlFor="corridor-select"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Corridor
            </label>
            {corridors.kind === "loading" && (
              <div
                aria-live="polite"
                className="mt-2 h-10 w-full animate-pulse rounded border border-[var(--ghost)] bg-[var(--black)]"
              />
            )}
            {corridors.kind === "error" && (
              <p role="alert" className="mt-2 text-xs text-[#ee8f81]">
                {corridors.message}
              </p>
            )}
            {corridors.kind === "ready" && (
              <select
                id="corridor-select"
                aria-label="Select corridor"
                value={selectedCorridor}
                onChange={(e) => handleCorridorChange(e.target.value)}
                className="mt-2 block w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-2 text-sm text-[var(--white)] focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">Select a corridor…</option>
                {corridors.options.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Window selector */}
          <div>
            <span
              id="window-selector-label"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Lookback window
            </span>
            <div
              role="group"
              aria-labelledby="window-selector-label"
              className="mt-2 inline-flex rounded-md border border-[var(--ghost)] bg-[var(--black)] p-1"
            >
              {SUPPORTED_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={selectedWindow === days}
                  onClick={() => handleWindowChange(days)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedWindow === days
                      ? "bg-[var(--surface)] text-[var(--white)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--white)]"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main coverage view */}
      <RateHistoryCoverageView state={view} />
    </div>
  );
}
