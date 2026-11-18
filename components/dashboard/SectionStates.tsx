
import { SectionRetry } from "@/components/dashboard/SectionRetry";

/**
 * Shared loading, empty, and unavailable states for the read-only evidence views
 * (anchors, corridors, rates, reputation).
 *
 * The three states never rely on colour alone. Each one carries a distinct
 * visible tag ("Loading", "No data", "Unavailable"), border style, and live-region
 * semantics:
 * - loading: `role="status"` + `aria-busy`, a polite announcement;
 * - empty: `role="status"`, a polite announcement that evidence is absent;
 * - unavailable: `role="alert"`, an assertive announcement that loading failed.
 * `data-evidence-state` exposes the state to tests and styling.
 */
export type EvidenceViewState = "loading" | "empty" | "unavailable";

const STATE_TAG: Record<EvidenceViewState, string> = {
  loading: "Loading",
  empty: "No data",
  unavailable: "Unavailable",
};

function StateTag({
  state,
  className,
}: {
  state: EvidenceViewState;
  className: string;
}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${className}`}
    >
      {STATE_TAG[state]}
      <span className="sr-only">: </span>
    </p>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-evidence-state="unavailable"
      className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
    >
      <StateTag state="unavailable" className="text-[#ee8f81]" />
      <p className="mt-2">{message}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Evidence could not be loaded. This does not mean it is absent.
      </p>
      <SectionRetry />
    </div>
  );
}

export function SectionEmpty({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-evidence-state="empty"
      className="rounded-lg border border-dashed border-[var(--ghost)] p-8 text-center text-sm text-[var(--muted)]"
    >
      <StateTag state="empty" className="text-[var(--muted)]" />
      <p className="mt-2">{message}</p>
    </div>
  );
}

export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-evidence-state="loading"
      className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8"
    >
      <StateTag state="loading" className="text-[var(--muted)]" />
      <p className="mt-2 text-sm text-[var(--muted)]">
        Loading {label}…
      </p>
      <div aria-hidden="true" className="mt-4 animate-pulse">
        <div className="h-3 w-28 rounded bg-[var(--ghost)]" />
        <div className="mt-4 h-24 rounded bg-[var(--ghost)]" />
      </div>
    </div>
  );
}
