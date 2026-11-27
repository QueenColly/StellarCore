"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor, PublicCorridorDetail } from "@/types/api/corridors";
import {
  buildAnchorCorridorMatrix,
  fetchAllPaginated,
  readApiErrorMessage,
} from "./matrix";
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
      // Fetch anchors list and corridors list in parallel
      const [anchorsRes, corridorsRes] = await Promise.all([
        fetchAllPaginated<PublicAnchorSummary>("/api/anchors", "anchors", {
          signal: controller.signal,
        }),
        fetchAllPaginated<PublicCorridor>("/api/corridors", "corridors", {
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      const isStale = anchorsRes.stale || corridorsRes.stale;

      // Fetch corridor details for each corridor to establish reviewed associations
      const corridorDetailsBySlug: Record<string, PublicCorridorDetail | null> = {};

      await Promise.all(
        corridorsRes.items.map(async (corridor) => {
          if (!corridor?.slug) return;
          try {
            const detailRes = await fetch(
              `/api/corridors/${encodeURIComponent(corridor.slug)}`,
              {
                method: "GET",
                credentials: "omit",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal: controller.signal,
              },
            );

            if (!detailRes.ok) {
              corridorDetailsBySlug[corridor.slug] = null;
              return;
            }

            const body = (await detailRes.json()) as { corridor?: PublicCorridorDetail };
            corridorDetailsBySlug[corridor.slug] = body?.corridor || null;
          } catch {
            // Network failure or abort
            corridorDetailsBySlug[corridor.slug] = null;
          }
        }),
      );

      if (controller.signal.aborted) return;

      const matrix = buildAnchorCorridorMatrix({
        rawAnchors: anchorsRes.items,
        rawCorridors: corridorsRes.items,
        corridorDetailsBySlug,
        stale: isStale,
      });

      setState({ kind: "ready", matrix });
    } catch (err) {
      if (!controller.signal.aborted) {
        setState({
          kind: "error",
          status: null,
          message:
            readApiErrorMessage(err) ??
            (err instanceof Error ? err.message : "Network error loading matrix data."),
        });
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return (
    <section className="mt-8" aria-labelledby="corridor-matrix-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2
            id="corridor-matrix-heading"
            className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]"
          >
            Reviewed Membership Evidence
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Corridors configured with reviewed anchor membership in the registry.
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
