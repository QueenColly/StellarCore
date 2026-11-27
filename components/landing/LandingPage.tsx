"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import {
  gsap,
  useGSAP,
} from "@/lib/gsap";
import type { CorridorRegistryEntry } from "@/types/corridor";
import {
  REVIEWED_COUNTRY_MAP_POINTS,
  WORLD_GRATICULE_PATH,
  WORLD_LAND_PATH,
} from "./worldMapGeometry";

type ReviewedCorridor = Pick<
  CorridorRegistryEntry,
  "slug" | "assetCodeFrom" | "countryFrom" | "assetCodeTo" | "countryTo"
>;

const INSPECTION_AREAS = Object.freeze([
  Object.freeze({
    area: "Anchors",
    title: "Reviewed identities",
    detail: "Advertised interfaces",
  }),
  Object.freeze({
    area: "Corridors",
    title: "Persisted associations",
    detail: "Anchor relationships",
  }),
  Object.freeze({
    area: "Rate evidence",
    title: "Stored observations",
    detail: "Freshness and eligibility",
  }),
  Object.freeze({
    area: "Reputation",
    title: "Evidence-aware evaluation",
    detail: "Null when unsupported",
  }),
]);

const EVIDENCE_PRINCIPLES = Object.freeze([
  Object.freeze({
    kicker: "Reviewed configuration",
    title: "Known, not assumed.",
    copy: "Anchor and corridor candidates are deliberately reviewed before they enter StellarCore's observation boundary.",
    signal: "Configured",
    boundary: "Not operational proof",
    tone: "lime",
  }),
  Object.freeze({
    kicker: "Advertised interfaces",
    title: "Reported, not certified.",
    copy: "Persisted SEP metadata describes what an anchor advertised during synchronization, not what is reachable now.",
    signal: "Synchronized",
    boundary: "Not availability",
    tone: "cyan",
  }),
  Object.freeze({
    kicker: "Rate observations",
    title: "Stored with time.",
    copy: "Indicative observations retain their capture time, freshness, and eligibility instead of becoming an evergreen quote.",
    signal: "Timestamped",
    boundary: "Not a firm quote",
    tone: "violet",
  }),
  Object.freeze({
    kicker: "Reputation evidence",
    title: "Null until supported.",
    copy: "Scores remain unpublished when legitimate transfer-outcome evidence is too sparse for the required threshold.",
    signal: "Evidence-aware",
    boundary: "No synthetic score",
    tone: "amber",
  }),
]);

const PRODUCT_CONTRACT = Object.freeze([
  Object.freeze({ title: "Read only", copy: "Inspect intelligence without initiating transfers." }),
  Object.freeze({ title: "Persisted first", copy: "Public views reflect evidence StellarCore has stored." }),
  Object.freeze({ title: "Freshness shown", copy: "Recent and stale observations remain distinct." }),
  Object.freeze({ title: "Null stays null", copy: "Missing evidence never becomes a fabricated zero." }),
]);

function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src="/StellarCore-logo.png"
      alt=""
      width={135}
      height={128}
      priority
      aria-hidden="true"
    />
  );
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function corridorLabel(corridor: ReviewedCorridor) {
  return `${corridor.assetCodeFrom} · ${corridor.countryFrom} → ${corridor.assetCodeTo} · ${corridor.countryTo}`;
}

function countryPoint(countryCode: string) {
  return REVIEWED_COUNTRY_MAP_POINTS[
    countryCode as keyof typeof REVIEWED_COUNTRY_MAP_POINTS
  ];
}

export function NetworkMap({ reviewedCorridors }: { reviewedCorridors: readonly ReviewedCorridor[] }) {
  const mappedCorridors = reviewedCorridors.flatMap((corridor) => {
    const from = countryPoint(corridor.countryFrom);
    const to = countryPoint(corridor.countryTo);
    return from && to ? [{ corridor, from, to }] : [];
  });
  const reviewedCountries = Array.from(
    new Set(reviewedCorridors.flatMap((corridor) => [corridor.countryFrom, corridor.countryTo])),
  ).flatMap((countryCode) => {
    const point = countryPoint(countryCode);
    return point ? [{ countryCode, ...point }] : [];
  });
  const accessibleSummary = reviewedCorridors.map(corridorLabel).join("; ");

  return (
    <figure
      className="network-map"
      aria-labelledby="reviewed-corridor-map-caption"
    >
      <div className="map-glow" aria-hidden="true" />
      <svg viewBox="0 0 1200 500" aria-hidden="true" focusable="false">
        <g className="map-graticule">
          <path d={WORLD_GRATICULE_PATH} />
        </g>
        <g className="world-land">
          <path d={WORLD_LAND_PATH} />
        </g>
        <g className="reviewed-corridor-geography">
          {mappedCorridors.map(({ corridor, from, to }) => {
            if (corridor.countryFrom === corridor.countryTo) {
              return (
                <g className="local-corridor" key={corridor.slug}>
                  <circle cx={from.x} cy={from.y} r="18" />
                  <circle cx={from.x} cy={from.y} r="25" />
                </g>
              );
            }

            const controlX = (from.x + to.x) / 2;
            const controlY = Math.min(from.y, to.y) - 120;
            return (
              <path
                className="corridor corridor-cross-country"
                d={`M${from.x} ${from.y} Q${controlX} ${controlY} ${to.x} ${to.y}`}
                key={corridor.slug}
              />
            );
          })}
          {reviewedCountries.map((country) => (
            <g className="configuration-country" key={country.countryCode}>
              <line x1={country.x - 8} y1={country.y} x2={country.x + 8} y2={country.y} />
              <line x1={country.x} y1={country.y - 8} x2={country.x} y2={country.y + 8} />
              <circle cx={country.x} cy={country.y} r="5" />
              <text className="map-country-label" x={country.labelX} y={country.labelY}>
                {country.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="map-evidence-key" aria-label="Evidence key">
        <span><i className="configuration-key" /> Reviewed configuration</span>
        <span><i className="observation-key" /> Persisted observations: dashboard only</span>
      </div>
      <ul className="map-corridor-list" aria-label="Reviewed corridor configuration">
        {reviewedCorridors.map((corridor) => (
          <li key={corridor.slug}>
            <Link
              className="map-corridor-link underline-offset-4 transition-colors hover:text-[var(--accent)] hover:underline focus-visible:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              href={`/corridors/${encodeURIComponent(corridor.slug)}`}
            >
              {corridorLabel(corridor)}
              <span className="sr-only"> — view reviewed corridor evidence</span>
            </Link>
            <small>{corridor.countryFrom === corridor.countryTo ? "local geography" : "cross-country geography"}</small>
          </li>
        ))}
      </ul>
      <div className="route-readout">
        <span>Reviewed configuration geography</span>
        <strong>Configuration ≠ observation</strong>
      </div>
      <figcaption className="map-accessible-summary" id="reviewed-corridor-map-caption">
        Reviewed corridor configuration: {accessibleSummary}. Same-country corridors use local rings,
        while cross-country corridors use geographic arcs. Persisted observations are not plotted on
        this landing-page map and remain available in the dashboard.
      </figcaption>
    </figure>
  );
}

function Hero({ reviewedCorridors }: { reviewedCorridors: readonly ReviewedCorridor[] }) {
  return (
    <section className="hero" id="top">
      <div className="hero-kicker reveal-item">
        <span>Read-only Stellar intelligence</span>
        <span>Built on Stellar</span>
      </div>
      <h1 className="hero-title">STELLARCORE</h1>
      <div className="hero-bottom reveal-item">
        <div className="hero-proposition">
          <p className="hero-proposition-lead">
            Inspect anchors, corridors, rate evidence, and reputation.
          </p>
          <p className="hero-proposition-detail">
            See what each stored signal supports—and what it does not prove.
          </p>
          <Link className="hero-cta" href="/dashboard">
            Inspect the dashboard <Arrow />
          </Link>
        </div>
        <div className="evidence-note"><i /> Evidence stays distinct</div>
      </div>
      <NetworkMap reviewedCorridors={reviewedCorridors} />
      <a className="scroll-cue reveal-item" href="#evidence-model" aria-label="Scroll to the evidence model">
        <span>Inspect the model</span>
        <i />
      </a>
    </section>
  );
}

function EvidenceTicker() {
  return (
    <section className="rate-section" id="evidence-model" aria-label="StellarCore evidence model">
      <div className="section-intro">
        <span className="eyebrow">What you can inspect</span>
        <p>Four read-only views of persisted Stellar network evidence.</p>
      </div>
      <div className="ticker-window">
        <div className="ticker-track">
          {INSPECTION_AREAS.map((item, index) => (
            <article className="rate-item" key={`${item.area}-${index}`}>
              <span>{item.area}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
          <div aria-hidden="true" style={{ display: "contents" }}>
            {INSPECTION_AREAS.map((item, index) => (
              <article className="rate-item" key={`${item.area}-dup-${index}`}>
                <span>{item.area}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SystemSection() {
  const steps = [
    ["01", "Discover", "Understand anchors and interfaces", "Inspect reviewed Stellar anchors and the interfaces they advertised during synchronization—without treating advertisement as current availability."],
    ["02", "Observe", "Read stored corridor evidence", "Compare persisted indicative rate observations across reviewed corridors, with capture time and eligibility kept visible."],
    ["03", "Evaluate", "See whether evidence is sufficient", "Freshness, independent-source requirements, and reputation evidence stay explicit. Missing evidence remains missing."],
  ];
  return (
    <section className="system-section" id="system">
      <div className="system-heading">
        <span className="eyebrow">How the product works</span>
        <h2><span>Infrastructure,</span><br /><em>made legible.</em></h2>
        <p>From reviewed network metadata to stored observations and evidence-aware evaluation.</p>
      </div>
      <div className="system-steps">
        {steps.map(([number, verb, title, copy]) => (
          <article className="system-step" key={number}>
            <div className="step-top"><span>{number}</span><span>{verb}</span></div>
            <div className="step-orbit" aria-hidden="true"><i /><i /><i /></div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidenceBoundariesSection() {
  return (
    <section className="anchors-section" id="evidence">
      <div className="anchors-glass" aria-hidden="true" />
      <div className="anchors-heading">
        <span className="eyebrow">Transparent by design</span>
        <h2><span>Evidence has</span><br /><span>boundaries.</span></h2>
      </div>
      <div className="anchor-viewport">
        <div className="anchor-track">
          {EVIDENCE_PRINCIPLES.map((principle, index) => (
            <article className={`anchor-card ${principle.tone}`} key={principle.title}>
              <div className="card-index">0{index + 1} · Evidence boundary</div>
              <div className="anchor-symbol" aria-hidden="true"><span /><span /><span /></div>
              <div className="anchor-copy">
                <span>{principle.kicker}</span>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </div>
              <div className="card-footer">
                <span><i /> {principle.signal}</span>
                <span>{principle.boundary}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductContractSection() {
  return (
    <section className="stats-section" id="product-contract">
      <div className="stats-copy">
        <span className="eyebrow">The product contract</span>
        <h2>Four promises.</h2>
      </div>
      <div className="contract-grid">
        {PRODUCT_CONTRACT.map((item, index) => (
          <article key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
      <div className="closing-cta">
        <p><span>See what is known.</span><br /><span>See what is not.</span></p>
        <Link href="/dashboard">Open dashboard <Arrow /></Link>
      </div>
      <footer>
        <Link className="brand" href="/"><BrandLogo /> StellarCore</Link>
        <p>Read-only evidence for an open financial network.</p>
        <div>
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/api/anchors">Anchor API</Link>
        </div>
        <span>Stellar intelligence · 2026</span>
      </footer>
    </section>
  );
}

function Cursor() {
  return <div className="cursor" aria-hidden="true"><span>View</span></div>;
}

export function LandingPage({ reviewedCorridors }: { reviewedCorridors: readonly ReviewedCorridor[] }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add({
      motion: "(prefers-reduced-motion: no-preference)",
      desktop: "(min-width: 900px)",
    }, (context) => {
      const { motion, desktop } = context.conditions as { motion: boolean; desktop: boolean };
      if (!motion) {
        gsap.set("[data-nav], .reveal-item", { autoAlpha: 1 });
        return;
      }

      const introText = gsap.utils.toArray<HTMLElement>(
        ".hero h1, .hero-kicker span, .hero-bottom p, .hero-bottom a, .evidence-note",
      );
      const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
      intro
        .from(introText, { y: 16, autoAlpha: 0, duration: 0.8, stagger: 0.06 })
        .from(".network-map", { scale: 0.92, autoAlpha: 0, duration: 1.2 }, "-=0.55")
        .from(".reveal-item", { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, "-=0.65")
        .from("[data-nav]", { y: -20, autoAlpha: 0, duration: 0.7 }, "-=0.5");

      const scrollText = gsap.utils.toArray<HTMLElement>([
        ".rate-section .eyebrow",
        ".section-intro p",
        ".rate-item > *",
        ".system-section .eyebrow",
        ".system-heading h2 > *",
        ".system-heading p",
        ".step-top span",
        ".system-step h3",
        ".system-step > p",
        ".anchors-section .eyebrow",
        ".anchors-heading h2 > *",
        ".anchor-copy > *",
        ".card-footer span:last-child",
        ".stats-section .eyebrow",
        ".stats-copy h2 > *",
        ".contract-grid article > *",
        "footer p",
        "footer > div a",
        "footer > span",
      ].join(", "));

      scrollText.forEach((element) => {
        gsap.from(element, {
          y: 16,
          autoAlpha: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });

      const mapIntro = gsap.timeline({ delay: 0.35 });
      mapIntro
        .from(".map-graticule path", { autoAlpha: 0, duration: 0.8, ease: "power2.out" })
        .from(".world-land path", { y: 4, autoAlpha: 0, duration: 0.9, ease: "power2.out" }, "-=0.5")
        .from(".configuration-country circle, .configuration-country line", {
          scale: 0,
          transformOrigin: "center",
          duration: 0.5,
          stagger: 0.06,
          ease: "back.out(1.4)",
        }, "-=0.25")
        .from(".local-corridor", {
          scale: 0,
          transformOrigin: "center",
          duration: 0.55,
          stagger: 0.08,
          ease: "back.out(1.35)",
        }, "-=0.2")
        .fromTo(
          ".corridor-cross-country",
          { strokeDasharray: 420, strokeDashoffset: 420 },
          { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" },
          "-=0.15",
        )
        .from(".map-country-label, .map-evidence-key, .map-corridor-list, .route-readout", {
          y: 5,
          autoAlpha: 0,
          duration: 0.55,
          stagger: 0.04,
          ease: "power2.out",
        }, "-=0.45");
      gsap.to(".ticker-track", { xPercent: -50, duration: 25, repeat: -1, ease: "none" });

      gsap.utils.toArray<HTMLElement>(".system-step").forEach((step) => {
        gsap.from(step.children, {
          y: 44,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: step, start: "top 78%", once: true },
        });
      });

      if (desktop) {
        const track = document.querySelector<HTMLElement>(".anchor-track");
        const viewport = document.querySelector<HTMLElement>(".anchor-viewport");
        if (track && viewport) {
          const travel = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
          gsap.to(track, {
            x: () => -travel(),
            ease: "none",
            scrollTrigger: {
              trigger: ".anchors-section",
              start: "top top",
              end: () => `+=${Math.max(850, travel() + 280)}`,
              scrub: 0.8,
              pin: true,
              invalidateOnRefresh: true,
            },
          });
        }

        const cursor = document.querySelector<HTMLElement>(".cursor");
        if (cursor) {
          const xTo = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3.out" });
          const yTo = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3.out" });
          const move = (event: PointerEvent) => { xTo(event.clientX); yTo(event.clientY); };
          window.addEventListener("pointermove", move);
          const interactive = gsap.utils.toArray<HTMLElement>("a, .anchor-card");
          const enter = () => cursor.classList.add("is-active");
          const leave = () => cursor.classList.remove("is-active");
          interactive.forEach((item) => { item.addEventListener("pointerenter", enter); item.addEventListener("pointerleave", leave); });
          return () => {
            window.removeEventListener("pointermove", move);
            interactive.forEach((item) => { item.removeEventListener("pointerenter", enter); item.removeEventListener("pointerleave", leave); });
          };
        }
      }
    });

    return () => mm.revert();
  }, { scope: root });

  return (
    <div ref={root} className="landing-page">
      <ProductHeader current="home" variant="overlay" />
      <main id="main-content">
        <Hero reviewedCorridors={reviewedCorridors} />
        <EvidenceTicker />
        <SystemSection />
        <EvidenceBoundariesSection />
        <ProductContractSection />
      </main>
      <div className="grain" aria-hidden="true" />
      <Cursor />
    </div>
  );
}
