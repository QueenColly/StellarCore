"use client";

import { useEffect, useState } from "react";
import {
  buildGeographyIndex,
  parseCorridorsResponse,
} from "./geography";
import { GeographyView, type GeographyViewState } from "./GeographyView";

const REQUEST_INIT: RequestInit = Object.freeze({
  method: "GET",
  credentials: "omit",
  cache: "no-store",
  redirect: "error",
  headers: { Accept: "application/json" },
});

export function GeographyClient() {
  const [viewState, setViewState] = useState<GeographyViewState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadCorridors() {
      try {
        const response = await fetch("/api/corridors", {
          ...REQUEST_INIT,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isMounted) {
            setViewState({
              kind: "error",
              message: `Corridors directory returned HTTP ${response.status}.`,
            });
          }
          return;
        }

        const data = await response.json();
        const corridors = parseCorridorsResponse(data);

        if (!corridors) {
          if (isMounted) {
            setViewState({
              kind: "error",
              message: "Failed to parse public corridors directory response.",
            });
          }
          return;
        }

        const index = buildGeographyIndex(corridors);
        if (isMounted) {
          setViewState({ kind: "ready", index });
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted && isMounted) {
          const message = err instanceof Error ? err.message : "Network error";
          setViewState({ kind: "error", message });
        }
      }
    }

    loadCorridors();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  return <GeographyView state={viewState} />;
}
