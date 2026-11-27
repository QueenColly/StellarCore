"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSepMatrix, readApiErrorMessage } from "./matrix";
import { MatrixView, type MatrixViewState } from "./MatrixView";

export function MatrixClient() {
  const [state, setState] = useState<MatrixViewState>({ kind: "loading" });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "loading" });

    try {
      const response = await fetch("/api/anchors", {
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
          message:
            readApiErrorMessage(body) ??
            `Failed to load anchors (HTTP ${response.status}).`,
        });
        return;
      }

      const matrix = parseSepMatrix(
        body,
        response.headers.get("x-evidence-state") || response.headers.get("x-stale-evidence"),
      );

      if (matrix === null) {
        setState({
          kind: "error",
          status: response.status,
          message: "The anchors response could not be parsed into a capability matrix.",
        });
      } else {
        setState({ kind: "ready", matrix });
      }
    } catch {
      if (!controller.signal.aborted) {
        setState({
          kind: "error",
          status: null,
          message: "Network error loading anchors data.",
        });
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return (
    <section className="mt-8" aria-labelledby="matrix-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2
            id="matrix-heading"
            className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]"
          >
            Reviewed Anchor SEP Coverage
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Columns represent SEPs present in current reviewed anchor records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.kind === "loading"}
          className="rounded-md border border-[var(--ghost)] px-3 py-1.5 text-xs text-[var(--white)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] hover:border-[var(--accent)]"
        >
          Refresh
        </button>
      </div>

      <div aria-live="polite">
        <MatrixView state={state} />
      </div>
    </section>
  );
}
