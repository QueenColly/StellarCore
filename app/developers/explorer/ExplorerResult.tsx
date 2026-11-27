import { Badge } from "@/components/dashboard/Badge";
import {
  describeEvidence,
  type EvidenceNotice,
  type ExplorerOutcome,
} from "@/lib/developerExplorer/response";

const NOTICE_TONE: Record<EvidenceNotice["kind"], "positive" | "warning" | "negative" | "neutral"> = {
  persisted: "positive",
  stale: "warning",
  insufficient: "warning",
  empty: "neutral",
  error: "negative",
  unavailable: "negative",
};

const NOTICE_LABEL: Record<EvidenceNotice["kind"], string> = {
  persisted: "Persisted",
  stale: "Stale",
  insufficient: "Insufficient",
  empty: "Empty",
  error: "Rejected",
  unavailable: "Unavailable",
};

/** Pure render of an explorer outcome; safe for any JSON the API returns. */
export function ExplorerResult({
  outcome,
  pending = false,
}: Readonly<{ outcome: ExplorerOutcome | null; pending?: boolean }>) {
  if (outcome === null) {
    return (
      <div
        role="status"
        data-explorer-state={pending ? "loading" : "idle"}
        className="rounded-lg border border-dashed border-[var(--ghost)] p-8 text-center text-sm text-[var(--muted)]"
      >
        {pending ? "Sending request…" : "Choose an endpoint and send a request to inspect its response."}
      </div>
    );
  }

  const notices = describeEvidence(outcome);
  const statusText = outcome.kind === "response"
    ? `HTTP ${outcome.status}`
    : outcome.kind === "network_error"
      ? "Network error"
      : "Blocked";

  let json: string | null = null;
  if (outcome.kind === "response" && outcome.body !== null) {
    try {
      json = JSON.stringify(outcome.body, null, 2);
    } catch {
      json = null;
    }
  }

  return (
    <div
      className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
      data-explorer-state={outcome.kind === "response" ? outcome.statusClass : outcome.kind}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-[var(--white)]" data-testid="explorer-status">{statusText}</span>
        <span className="break-all font-mono text-xs text-[var(--muted)]">GET {outcome.path}</span>
        {outcome.kind === "response" && (
          <span className="text-xs text-[var(--muted)]">{outcome.durationMs} ms</span>
        )}
      </div>

      <ul className="mt-4 space-y-2" aria-label="Evidence interpretation">
        {notices.map((notice, index) => (
          <li
            key={`${notice.kind}-${index}`}
            data-evidence-notice={notice.kind}
            className="flex flex-col gap-1 rounded-md border border-[var(--ghost)] p-3 sm:flex-row sm:items-start sm:gap-3"
          >
            <Badge tone={NOTICE_TONE[notice.kind]} label={NOTICE_LABEL[notice.kind]} />
            <div>
              <p className="text-sm text-[var(--white)]">{notice.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{notice.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {json !== null && (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Response JSON</h3>
          <pre
            tabIndex={0}
            aria-label="Response JSON"
            className="mt-2 max-h-[32rem] overflow-auto rounded-md border border-[var(--ghost)] bg-[var(--black)] p-3 font-mono text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
