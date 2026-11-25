"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Reader-initiated re-read of the dashboard's persisted evidence.
 *
 * It only asks Next.js to re-render the dashboard's server components
 * (`router.refresh()`), so each panel re-runs its own existing read. It never
 * starts SEP discovery, rate capture, source monitoring, fresh quotes or a
 * reputation recalculation, never polls, and never refreshes on mount.
 */
export type RefreshEvidenceStatus = "idle" | "pending" | "completed" | "failed";

export const REFRESH_STATUS_COPY: Readonly<Record<RefreshEvidenceStatus, string>> =
  Object.freeze({
    idle: "",
    pending: "Re-reading persisted evidence…",
    completed:
      "Display re-read from persisted evidence. Values may be unchanged; check each panel's own timestamps.",
    failed:
      "The display could not be re-read. Panels still show their previous results; you can try again.",
  });

/**
 * Start a single refresh request. Ignores the call while one is already
 * pending so repeated clicks cannot queue duplicate refreshes, and reports a
 * synchronous failure so the control becomes usable again.
 */
export function requestEvidenceRefresh(
  options: Readonly<{
    status: RefreshEvidenceStatus;
    refresh: () => void;
    startTransition: (callback: () => void) => void;
    setStatus: (status: RefreshEvidenceStatus) => void;
  }>,
): boolean {
  if (options.status === "pending") return false;
  options.setStatus("pending");
  try {
    options.startTransition(() => {
      options.refresh();
    });
    return true;
  } catch {
    options.setStatus("failed");
    return false;
  }
}

/** Pure presentation, so the busy/disabled and feedback states are testable. */
export function RefreshEvidenceControl({
  status,
  onRefresh,
}: Readonly<{
  status: RefreshEvidenceStatus;
  onRefresh: () => void;
}>) {
  const pending = status === "pending";

  return (
    <div className="mt-5 flex flex-col items-start gap-2" data-testid="refresh-evidence">
      <button
        type="button"
        onClick={onRefresh}
        disabled={pending}
        aria-busy={pending}
        aria-describedby="refresh-evidence-hint"
        className="inline-flex items-center gap-2 rounded border border-[var(--ghost)] px-3 py-2 text-xs font-medium text-[var(--white)] transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden="true">↻</span>
        {pending ? "Refreshing displayed evidence…" : "Refresh displayed evidence"}
      </button>
      <p id="refresh-evidence-hint" className="max-w-xl text-xs leading-relaxed text-[var(--muted)]">
        Re-reads what StellarCore has already persisted. It does not run SEP discovery, capture new rates, request
        fresh quotes, monitor sources or recalculate reputation.
      </p>
      <p
        role="status"
        aria-live="polite"
        data-testid="refresh-evidence-status"
        className="text-xs text-[var(--muted)]"
      >
        {REFRESH_STATUS_COPY[status]}
      </p>
    </div>
  );
}

export function RefreshEvidenceButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<RefreshEvidenceStatus>("idle");
  const sawPending = useRef(false);

  // Settle the status once the transition started by a click has finished.
  // This effect never initiates a refresh, so nothing happens on mount.
  useEffect(() => {
    if (status !== "pending") return;
    if (isPending) {
      sawPending.current = true;
      return;
    }
    if (sawPending.current) {
      sawPending.current = false;
      setStatus("completed");
    }
  }, [isPending, status]);

  // A transition that completes before React reports it as pending still has to
  // release the control; fall back after a short, bounded wait.
  useEffect(() => {
    if (status !== "pending") return;
    const timer = setTimeout(() => {
      if (!sawPending.current) setStatus("completed");
    }, 1_000);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <RefreshEvidenceControl
      status={isPending ? "pending" : status}
      onRefresh={() =>
        requestEvidenceRefresh({
          status: isPending ? "pending" : status,
          refresh: () => router.refresh(),
          startTransition,
          setStatus,
        })
      }
    />
  );
}
