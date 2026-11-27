import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { MIN_FRESH_SOURCES, RATE_FRESHNESS_THRESHOLD_MS } from "@/constants/rates";

export const metadata: Metadata = {
  title: "Evidence and freshness states — StellarCore",
  description:
    "A plain-language guide to reviewed configuration, persisted observations, freshness, insufficient medians, stale fallbacks, and failed retrievals.",
};

const LINK_CLASSES =
  "underline decoration-[var(--ghost)] underline-offset-4 hover:text-[var(--accent)] hover:decoration-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

const EVIDENCE_LAYERS = Object.freeze([
  Object.freeze({
    id: "reviewed-configuration",
    step: "01",
    title: "Reviewed configuration",
    summary: "A deliberate choice about where StellarCore is allowed to look.",
    can: "You can conclude the anchor or corridor was intentionally reviewed for observation.",
    cannot:
      "It does not mean a verified, operational, or safe transfer route, and it is not itself an observation.",
  }),
  Object.freeze({
    id: "synchronized-metadata",
    step: "02",
    title: "Synchronized metadata",
    summary: "SEP capabilities recorded during the last successful SEP-1 synchronization.",
    can: "You can see which interfaces an anchor advertised when that metadata was captured.",
    cannot:
      "Advertised SEP capability is not current service availability. A persisted transfer-capable flag is derived from advertised SEP-6, SEP-24, or SEP-31 metadata; it does not prove a route works now.",
  }),
  Object.freeze({
    id: "persisted-observation",
    step: "03",
    title: "Persisted observation",
    summary: "A timestamped indicative SEP-38 rate that StellarCore actually stored.",
    can: "You can inspect what was captured, including its anchor, capture time, and reported amounts.",
    cannot:
      "It is not a firm quote, an executable price, a live offer, or a transfer instruction.",
  }),
  Object.freeze({
    id: "fresh-independent-evidence",
    step: "04",
    title: "Fresh independent evidence",
    summary: "Recent, eligible observations from distinct anchors.",
    can: "You can count how many stored observations are fresh and eligible for the median.",
    cannot:
      "Stale, future-dated, or invalid observations stay visible but do not become fresh simply because they exist.",
  }),
  Object.freeze({
    id: "published-median",
    step: "05",
    title: "Published median when sufficient",
    summary: "The API-provided summary, published only after the threshold is met.",
    can: "You can read the median that the public API actually published.",
    cannot:
      "No individual observation is promoted to a median on this guide, and no median is published when the threshold is unmet.",
  }),
]);

const STATE_BOUNDARIES = Object.freeze([
  Object.freeze({
    id: "valid-no-data",
    state: "Valid no data",
    signal: "A successful read with no stored observations.",
    meaning:
      "This is a real answer: nothing has been persisted for that corridor. Counts are zero and the median is null. It is not an outage and not a zero rate.",
  }),
  Object.freeze({
    id: "insufficient-sources",
    state: "Insufficient independent sources",
    signal: `Fewer than ${MIN_FRESH_SOURCES} fresh, eligible observations from distinct anchors.`,
    meaning:
      "The read is successful, the observations remain visible, and medianRate stays null. State is insufficient_fresh_sources rather than healthy.",
  }),
  Object.freeze({
    id: "stale-fallback",
    state: "Stale or degraded fallback",
    signal: "A verified last-known-good snapshot is returned after the current read was unavailable.",
    meaning:
      "The body keeps its usual shape but is explicitly labelled as stale persisted evidence. It is not current evidence and a stale observation is not median-eligible.",
  }),
  Object.freeze({
    id: "failed-retrieval",
    state: "Failed retrieval",
    signal: "The public read cannot be completed.",
    meaning:
      "The API reports an error. This is not the same as an empty result: no value is inferred, substituted, or changed to zero.",
  }),
  Object.freeze({
    id: "advertised-capability",
    state: "Advertised capability",
    signal: "Persisted SEP metadata says an anchor advertises an interface.",
    meaning:
      "This describes what was synchronized, not whether the service is reachable, healthy, or able to complete a transfer now.",
  }),
]);

export default function EvidenceStatesGuidePage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-5xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Evidence literacy</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              How to read StellarCore evidence states
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              StellarCore is a read-only dashboard. Each signal has a boundary: configuration is not observation,
              advertised capability is not availability, a stored observation is not a quote, and a missing value is
              never replaced with a fabricated one.
            </p>
          </header>

          <nav
            aria-labelledby="guide-nav-heading"
            className="mt-6 flex flex-wrap gap-2 text-sm"
            data-evidence-guide="jump-nav"
          >
            <h2 id="guide-nav-heading" className="sr-only">
              On this page
            </h2>
            {[
              { href: "#evidence-chain-heading", label: "Evidence layers" },
              { href: "#thresholds-heading", label: "Thresholds" },
              { href: "#state-boundaries-heading", label: "State boundaries" },
              { href: "#references-heading", label: "References" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded border border-[var(--ghost)] px-3 py-2 text-xs text-[var(--white)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <aside
            className="mt-6 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--white)] sm:p-5"
            aria-labelledby="explainer-only-heading"
            data-evidence-guide="explainer-only"
          >
            <h2 id="explainer-only-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
              Explanatory guide only
            </h2>
            <p className="mt-2">
              This page contains no live data, no verified rate observations, and no executable prices. The scenarios
              below are illustrative examples used only to explain state boundaries.
            </p>
          </aside>

          <section className="mt-10" aria-labelledby="evidence-chain-heading">
            <h2 id="evidence-chain-heading" className="text-xl text-[var(--white)] sm:text-2xl">
              From configuration to median
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              These layers are related, but one does not prove the next. Read them in order and keep the boundary in
              view.
            </p>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {EVIDENCE_LAYERS.map((layer) => (
                <li
                  key={layer.id}
                  className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4"
                  data-evidence-guide={layer.id}
                >
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">{layer.step}</span>
                  <h3 className="mt-2 text-base text-[var(--white)]">{layer.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--white)]">{layer.summary}</p>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                    <strong className="font-medium text-[var(--white)]">You can conclude:</strong> {layer.can}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                    <strong className="font-medium text-[var(--white)]">You cannot conclude:</strong> {layer.cannot}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-labelledby="thresholds-heading">
            <h2 id="thresholds-heading" className="sr-only">
              Current freshness and median thresholds
            </h2>
            <div
              className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
              data-evidence-guide="freshness-threshold"
            >
              <h3 className="text-lg text-[var(--white)]">Freshness is an age check</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                An observation is fresh only while its capture time is within the current threshold of{" "}
                <strong className="font-medium text-[var(--white)]">{RATE_FRESHNESS_THRESHOLD_MS} ms</strong>. Older
                evidence is labelled stale. Future-dated and invalid times have their own states and are not treated as
                fresh.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                Freshness describes age. It does not turn an indicative observation into a live offer.
              </p>
            </div>
            <div
              className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
              data-evidence-guide="median-threshold"
            >
              <h3 className="text-lg text-[var(--white)]">A median needs independent agreement</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                The current median requires at least{" "}
                <strong className="font-medium text-[var(--white)]">{MIN_FRESH_SOURCES} fresh independent sources</strong>
                . When fewer qualify, the median is not published: <code>medianRate</code> is null and the state is{" "}
                <code>insufficient_fresh_sources</code>.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                No median is published when the threshold is unmet. One observation, one anchor, or reviewed
                configuration alone never satisfies it.
              </p>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="state-boundaries-heading">
            <h2 id="state-boundaries-heading" className="text-xl text-[var(--white)] sm:text-2xl">
              State boundaries, side by side
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              Each row below is an illustrative example. None of these examples is live data or a verified rate
              observation.
            </p>
            <p
              id="evidence-table-hint"
              className="mt-3 text-xs leading-relaxed text-[var(--muted)]"
            >
              On narrow screens, focus the table region and use the left and right arrow keys to reveal every column.
            </p>
            <div
              className="mt-3 overflow-x-auto rounded-lg border border-[var(--ghost)]"
              role="region"
              aria-labelledby="state-boundaries-heading"
              aria-describedby="evidence-table-hint"
              tabIndex={0}
            >
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Illustrative evidence-state examples, not live or verified rate observations
                </caption>
                <thead className="bg-[var(--surface)]">
                  <tr>
                    <th scope="col" className="p-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                      State
                    </th>
                    <th scope="col" className="p-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                      Illustrative signal
                    </th>
                    <th scope="col" className="p-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                      How to read it
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {STATE_BOUNDARIES.map((boundary) => (
                    <tr key={boundary.id} className="border-t border-[var(--ghost)]" data-evidence-example={boundary.id}>
                      <th scope="row" className="p-3 align-top font-medium text-[var(--white)]">
                        {boundary.state}
                      </th>
                      <td className="p-3 align-top text-[var(--white)]">{boundary.signal}</td>
                      <td className="p-3 align-top text-[var(--muted)]">{boundary.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5" aria-labelledby="references-heading">
            <h2 id="references-heading" className="text-xl text-[var(--white)]">
              Continue with the read-only sources
            </h2>
            <ul className="mt-4 grid gap-3 text-sm leading-relaxed sm:grid-cols-2">
              <li>
                <Link className={LINK_CLASSES} href="/dashboard">
                  Open the public dashboard
                </Link>
                <span className="block text-xs text-[var(--muted)]">
                  See persisted anchors, corridors, rate evidence, and the current evidence legend.
                </span>
              </li>
              <li>
                <Link className={LINK_CLASSES} href="/developers/explorer">
                  Inspect the public API explorer
                </Link>
                <span className="block text-xs text-[var(--muted)]">
                  Make allowlisted GET-only requests and inspect the real response structure.
                </span>
              </li>
              <li>
                <a
                  className={LINK_CLASSES}
                  href="https://github.com/Aboyeji-Isaac/StellarCore/blob/contributions/docs/api-reference.md"
                  rel="noopener noreferrer"
                >
                  Public API reference
                </a>
                <span className="block text-xs text-[var(--muted)]">
                  Technical response states, field meanings, and GET-only endpoint contracts.
                </span>
              </li>
              <li>
                <a
                  className={LINK_CLASSES}
                  href="https://github.com/Aboyeji-Isaac/StellarCore/blob/contributions/docs/evidence-provenance-walkthrough.md"
                  rel="noopener noreferrer"
                >
                  Evidence provenance walkthrough
                </a>
                <span className="block text-xs text-[var(--muted)]">
                  How reviewed configuration becomes a stored, timestamped observation.
                </span>
              </li>
            </ul>
          </section>

          <p className="mt-8 text-xs leading-relaxed text-[var(--muted)]">
            StellarCore does not initiate transfers, create firm quotes, or monitor background state from this guide.
            It explains persisted evidence only.
          </p>
        </div>
      </main>
    </>
  );
}
