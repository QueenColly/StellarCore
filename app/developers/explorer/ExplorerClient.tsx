"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  buildExplorerRequest,
  EXPLORER_DEFAULT_HISTORY_DAYS,
  EXPLORER_ENDPOINT_IDS,
  EXPLORER_ENDPOINTS,
  EXPLORER_HISTORY_DAYS,
  EXPLORER_MAX_LIMIT,
  EXPLORER_MAX_OFFSET,
  explorerRequestExamples,
  type ExplorerEndpointId,
} from "@/lib/developerExplorer/endpoints";
import {
  executeExplorerRequest,
  type ExplorerOutcome,
} from "@/lib/developerExplorer/response";
import { ExplorerResult } from "./ExplorerResult";

type Props = Readonly<{
  anchorSlugs: readonly string[];
  corridorSlugs: readonly string[];
}>;

const fieldClass =
  "mt-1 w-full rounded-md border border-[var(--ghost)] bg-[var(--black)] px-3 py-2 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const labelClass = "block text-xs uppercase tracking-wide text-[var(--muted)]";

export function ExplorerClient({ anchorSlugs, corridorSlugs }: Props) {
  const [endpoint, setEndpoint] = useState<ExplorerEndpointId>("rates.latest");
  const [anchor, setAnchor] = useState(anchorSlugs[0] ?? "");
  const [corridor, setCorridor] = useState(corridorSlugs[0] ?? "");
  const [days, setDays] = useState(String(EXPLORER_DEFAULT_HISTORY_DAYS));
  const [limit, setLimit] = useState("");
  const [offset, setOffset] = useState("");
  const [outcome, setOutcome] = useState<ExplorerOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [origin, setOrigin] = useState("http://localhost:3000");
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => controllerRef.current?.abort();
  }, []);

  const definition = EXPLORER_ENDPOINTS[endpoint];
  const accepts = useMemo(
    () => new Set<string>([...definition.required, ...definition.optional]),
    [definition],
  );

  const build = buildExplorerRequest(
    {
      endpoint,
      params: {
        anchor: accepts.has("anchor") ? anchor : undefined,
        corridor: accepts.has("corridor") ? corridor : undefined,
        days: accepts.has("days") ? days : undefined,
        limit: accepts.has("limit") ? limit.trim() : undefined,
        offset: accepts.has("offset") ? offset.trim() : undefined,
      },
    },
    { anchorSlugs, corridorSlugs },
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!build.ok || pending) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    try {
      const result = await executeExplorerRequest(
        build.request,
        (input, init) => fetch(input, init),
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setOutcome(result);
    } catch {
      // Aborted by a newer request or unmount; nothing to show.
    } finally {
      if (controllerRef.current === controller) setPending(false);
    }
  }

  const examples = build.ok ? explorerRequestExamples(build.request, origin) : null;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form
        onSubmit={onSubmit}
        aria-labelledby="explorer-request-heading"
        className="h-fit rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
        noValidate
      >
        <h2 id="explorer-request-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Request
        </h2>

        <div className="mt-4">
          <label htmlFor="explorer-endpoint" className={labelClass}>Endpoint</label>
          <select
            id="explorer-endpoint"
            className={fieldClass}
            value={endpoint}
            onChange={(event) => {
              const next = event.target.value;
              if ((EXPLORER_ENDPOINT_IDS as readonly string[]).includes(next)) {
                setEndpoint(next as ExplorerEndpointId);
                setOutcome(null);
              }
            }}
          >
            {EXPLORER_ENDPOINT_IDS.map((id) => (
              <option key={id} value={id}>
                GET {EXPLORER_ENDPOINTS[id].pathTemplate.split("?")[0]} — {EXPLORER_ENDPOINTS[id].label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{definition.description}</p>
        </div>

        {accepts.has("anchor") && (
          <div className="mt-4">
            <label htmlFor="explorer-anchor" className={labelClass}>Reviewed anchor</label>
            <select id="explorer-anchor" className={fieldClass} value={anchor} onChange={(event) => setAnchor(event.target.value)}>
              {anchorSlugs.map((slug) => <option key={slug} value={slug}>{slug}</option>)}
            </select>
          </div>
        )}

        {accepts.has("corridor") && (
          <div className="mt-4">
            <label htmlFor="explorer-corridor" className={labelClass}>Reviewed corridor</label>
            <select id="explorer-corridor" className={fieldClass} value={corridor} onChange={(event) => setCorridor(event.target.value)}>
              {corridorSlugs.map((slug) => <option key={slug} value={slug}>{slug}</option>)}
            </select>
          </div>
        )}

        {accepts.has("days") && (
          <div className="mt-4">
            <label htmlFor="explorer-days" className={labelClass}>History window (days)</label>
            <select id="explorer-days" className={fieldClass} value={days} onChange={(event) => setDays(event.target.value)}>
              {EXPLORER_HISTORY_DAYS.map((value) => <option key={value} value={String(value)}>{value}</option>)}
            </select>
          </div>
        )}

        {accepts.has("limit") && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="explorer-limit" className={labelClass}>Limit</label>
              <input
                id="explorer-limit"
                className={fieldClass}
                inputMode="numeric"
                type="number"
                min={1}
                max={EXPLORER_MAX_LIMIT}
                placeholder="all"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                aria-describedby="explorer-pagination-hint"
              />
            </div>
            <div>
              <label htmlFor="explorer-offset" className={labelClass}>Offset</label>
              <input
                id="explorer-offset"
                className={fieldClass}
                inputMode="numeric"
                type="number"
                min={0}
                max={EXPLORER_MAX_OFFSET}
                placeholder="0"
                value={offset}
                onChange={(event) => setOffset(event.target.value)}
                aria-describedby="explorer-pagination-hint"
              />
            </div>
            <p id="explorer-pagination-hint" className="col-span-2 text-xs text-[var(--muted)]">
              Optional. Limit 1–{EXPLORER_MAX_LIMIT}, offset 0–{EXPLORER_MAX_OFFSET}.
            </p>
          </div>
        )}

        {!build.ok && (
          <p role="alert" className="mt-4 text-sm text-[#ee8f81]" data-testid="explorer-denied">
            {build.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!build.ok || pending}
          className="mt-5 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--black)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          {pending ? "Sending…" : "Send GET request"}
        </button>

        {examples && (
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Request example</h3>
            <p className="mt-2 break-all font-mono text-xs text-[var(--white)]" data-testid="explorer-path">
              GET {build.ok ? build.request.path : ""}
            </p>
            <CopyBlock label="curl" text={examples.curl} />
            <CopyBlock label="fetch" text={examples.fetch} />
          </div>
        )}
      </form>

      <section aria-labelledby="explorer-response-heading" aria-live="polite" aria-busy={pending}>
        <h2 id="explorer-response-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Response
        </h2>
        <div className="mt-4">
          <ExplorerResult outcome={outcome} pending={pending} />
        </div>
      </section>
    </div>
  );
}

function CopyBlock({ label, text }: Readonly<{ label: string; text: string }>) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-1 text-xs text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label={`Copy ${label} request example`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-[var(--ghost)] bg-[var(--black)] p-3 font-mono text-xs text-[var(--white)]">
        {text}
      </pre>
    </div>
  );
}
