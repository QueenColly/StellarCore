import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { AnchorsSection } from "@/components/dashboard/AnchorsSection";
import { CorridorsSection } from "@/components/dashboard/CorridorsSection";
import { SectionError } from "@/components/dashboard/SectionStates";
import type { AnchorDirectoryRecord } from "@/lib/api/anchorRepository";

const dashboardSource = readFileSync(
  new URL("../../../app/dashboard/page.tsx", import.meta.url),
  "utf8",
);
const retrySource = readFileSync(
  new URL("../../../components/dashboard/SectionRetry.tsx", import.meta.url),
  "utf8",
);

test("dashboard panels stream independently when one request is still pending", async () => {
  let finishAnchors!: (value: readonly AnchorDirectoryRecord[]) => void;
  const anchorsPending = new Promise<readonly AnchorDirectoryRecord[]>((resolve) => {
    finishAnchors = resolve;
  });
  const anchorsPanel = AnchorsSection({ dependencies: {
    repository: { findAll: () => anchorsPending, findBySlug: async () => null },
  } });
  const corridorsPanel = CorridorsSection({ dependencies: {
    repository: { findAll: async () => [{
      slug: "usdc-us-brl-br",
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
      anchorCount: 2,
    }] },
  } });

  const corridors = await corridorsPanel;
  assert.match(renderToStaticMarkup(corridors), /USDC · US/);
  assert.equal(await Promise.race([anchorsPanel.then(() => "done"), Promise.resolve("pending")]), "pending");

  finishAnchors([{ slug: "anchor-one", name: "Anchor One", homeDomain: "one.example", status: "LIVE", seps: [], corridorCount: 1 }]);
  assert.match(renderToStaticMarkup(await anchorsPanel), /Anchor One/);
});

test("mixed results keep a successful panel visible beside a scoped failure", async () => {
  const [anchors, corridors] = await Promise.all([
    AnchorsSection({ dependencies: { repository: {
      findAll: async () => [{ slug: "anchor-one", name: "Anchor One", homeDomain: "one.example", status: "LIVE", seps: [], corridorCount: 1 }],
      findBySlug: async () => null,
    } } }),
    CorridorsSection({ dependencies: { repository: {
      findAll: async () => { throw new Error("database unavailable"); },
    } } }),
  ]);

  assert.match(renderToStaticMarkup(anchors), /Anchor One/);
  assert.equal(corridors.type, SectionError);
  assert.equal((corridors.props as { message: string }).message, "Unable to load corridors.");
  assert.match(retrySource, /onClick=\{\(\) => router\.refresh\(\)\}/);
  assert.match(retrySource, /Refresh dashboard data/);
});

test("empty results render as empty and each panel owns an independent loading boundary", async () => {
  const emptyAnchors = await AnchorsSection({ dependencies: { repository: {
    findAll: async () => [],
    findBySlug: async () => null,
  } } });
  assert.match(renderToStaticMarkup(emptyAnchors), /No anchors are currently persisted\./);

  for (const [component, label] of [
    ["<AnchorsSection />", "anchors"],
    ["<CorridorsSection />", "corridors"],
    ["<RatePanel />", "rates"],
    ["<ReputationSection />", "reputation"],
  ]) {
    const escapedComponent = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(dashboardSource, new RegExp(`<Suspense fallback=\\{<SectionSkeleton label="${label}" \/>\\}>\\s*${escapedComponent}`));
  }
});
