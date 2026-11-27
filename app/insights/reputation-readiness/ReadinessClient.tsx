"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseReadinessList, readApiErrorMessage } from "./readiness";
import { ReadinessView, type ReadinessViewState } from "./ReadinessView";

/** Fetches GET /api/reputation once on load and on explicit refresh only. */
export function ReadinessClient({ minimumOutcomes }: Readonly<{ minimumOutcomes: number }>) {
  const [state, setState] = useState<ReadinessViewState>({ kind: "loading" });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/reputation", {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setState({
          kind: "error",
          status: response.status,
          message: readApiErrorMessage(body) ?? `Reputation request failed (HTTP ${response.status}).`,
        });
        return;
      }
      const list = parseReadinessList(body, response.headers.get("x-evidence-state"));
      setState(list === null
        ? { kind: "error", status: response.status, message: "The reputation response could not be read." }
        : { kind: "ready", list });
    } catch {
      if (!controller.signal.aborted) {
        setState({ kind: "error", status: null, message: "Network error while loading reputation evidence." });
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return (
    <section className="mt-8" aria-labelledby="readiness-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="readiness-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Per-anchor evaluation state
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.kind === "loading"}
          className="rounded-md border border-[var(--ghost)] px-3 py-1.5 text-xs text-[var(--white)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Refresh
        </button>
      </div>
      <div className="mt-4" aria-live="polite">
        <ReadinessView state={state} minimumOutcomes={minimumOutcomes} />
      </div>
    </section>
  );
}
