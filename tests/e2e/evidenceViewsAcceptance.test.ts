import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AnchorsSection } from "@/components/dashboard/AnchorsSection";
import { CorridorsSection } from "@/components/dashboard/CorridorsSection";
import { RatePanel } from "@/components/dashboard/RatePanel";
import { ReputationSection } from "@/components/dashboard/ReputationSection";
import {
  handleAnchorsRequest,
  handleCorridorsRequest,
  handleRatesRequest,
} from "@/lib/api/requestHandlers";
import { getReputationApiResult } from "@/lib/api/reputation";
import { publicApiJsonResponse } from "@/lib/api/http";
import {
  createFileStaleEvidenceStore,
  staleEvidenceHeaders,
} from "@/lib/api/staleEvidence";
import { readLatestCorridorRate } from "@/lib/rates/latestRateReadModel";
import type { AnchorDirectoryRecord, AnchorDirectoryRepository } from "@/lib/api/anchorRepository";
import type { CorridorDirectoryRecord, CorridorDirectoryRepository } from "@/lib/api/corridorRepository";
import type { LatestRateRepository, LatestRateRepositoryObservation } from "@/types/latestRates";
import type { ReputationApiAnchorRecord, ReputationApiRepository } from "@/lib/api/reputationRepository";
import { exposeReactForClassicJsx, withTestAppRouter } from "../support/dashboardContracts";

exposeReactForClassicJsx();

test("end-to-end acceptance: all four public evidence views operate consistently across empty, refreshed, and stale evidence", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "stellarcore-e2e-evidence-views-"));
  const staleEvidenceStore = createFileStaleEvidenceStore(tempDir);
  const OUTAGE = Object.assign(new Error("database offline"), { code: "P1001" });

  try {
    const timestamp = new Date("2026-10-15T12:00:00.000Z");
    const staleTimestamp = new Date("2026-10-15T12:03:00.000Z");

    let anchorsData: readonly AnchorDirectoryRecord[] = [];
    let corridorsData: readonly CorridorDirectoryRecord[] = [];
    let rateObservations: readonly LatestRateRepositoryObservation[] = [];
    let reputationData: readonly ReputationApiAnchorRecord[] = [];
    let simulateDbFailure = false;

    const anchorRepo: AnchorDirectoryRepository = {
      findAll: async () => {
        if (simulateDbFailure) throw OUTAGE;
        return anchorsData;
      },
      findBySlug: async () => null,
    };

    const corridorRepo: CorridorDirectoryRepository = {
      findAll: async () => {
        if (simulateDbFailure) throw OUTAGE;
        return corridorsData;
      },
    };

    const rateRepo: LatestRateRepository = {
      findCorridorBySlug: async (slug) => {
        if (simulateDbFailure) throw OUTAGE;
        const match = corridorsData.find((c) => c.slug === slug);
        if (!match) return null;
        return {
          id: `id-${match.slug}`,
          slug: match.slug,
          assetCodeFrom: match.assetCodeFrom,
          countryFrom: match.countryFrom,
          assetCodeTo: match.assetCodeTo,
          countryTo: match.countryTo,
        };
      },
      findLatestObservations: async () => {
        if (simulateDbFailure) throw OUTAGE;
        return rateObservations;
      },
    };

    const repRepo: ReputationApiRepository = {
      findAll: async () => {
        if (simulateDbFailure) throw OUTAGE;
        return reputationData;
      },
      findBySlug: async () => null,
    };

    const runViewFlow = async (evalTime: Date) => {
      const anchorsReq = new Request("http://localhost/api/anchors");
      const corridorsReq = new Request("http://localhost/api/corridors");
      const ratesReq = new Request("http://localhost/api/rates?corridor=usdc-us-brl-br");

      const [anchorsRes, corridorsRes, ratesRes, repResult] = await Promise.all([
        handleAnchorsRequest(anchorsReq, { repository: anchorRepo }),
        handleCorridorsRequest(corridorsReq, { repository: corridorRepo }),
        handleRatesRequest(ratesReq, {
          now: () => evalTime,
          staleEvidenceStore,
          readLatestRate: (slug, { evaluatedAt }) =>
            readLatestCorridorRate(slug, { repository: rateRepo, evaluatedAt }),
        }),
        getReputationApiResult({
          now: () => evalTime,
          staleEvidenceStore,
          repository: repRepo,
        }),
      ]);

      const repRes = publicApiJsonResponse(
        repResult,
        staleEvidenceHeaders("degraded" in repResult ? repResult.degraded : undefined),
      );

      const [anchorsBody, corridorsBody, ratesBody, repBody] = await Promise.all([
        anchorsRes.json(),
        corridorsRes.json(),
        ratesRes.json(),
        repRes.json(),
      ]);

      const [anchorsUi, corridorsUi, ratesUi, repUi] = await Promise.all([
        AnchorsSection({ dependencies: { repository: anchorRepo } }),
        CorridorsSection({ dependencies: { repository: corridorRepo } }),
        RatePanel({
          dependencies: {
            now: () => evalTime,
            staleEvidenceStore,
            readLatestRate: (slug, { evaluatedAt }) =>
              readLatestCorridorRate(slug, { repository: rateRepo, evaluatedAt }),
          },
        }),
        ReputationSection({
          dependencies: {
            now: () => evalTime,
            staleEvidenceStore,
            repository: repRepo,
          },
        }),
      ]);

      const markup = {
        anchors: renderToStaticMarkup(withTestAppRouter(anchorsUi)),
        corridors: renderToStaticMarkup(withTestAppRouter(corridorsUi)),
        rates: renderToStaticMarkup(withTestAppRouter(ratesUi)),
        reputation: renderToStaticMarkup(withTestAppRouter(repUi)),
      };

      return {
        responses: {
          anchors: { status: anchorsRes.status, body: anchorsBody, headers: anchorsRes.headers },
          corridors: { status: corridorsRes.status, body: corridorsBody, headers: corridorsRes.headers },
          rates: { status: ratesRes.status, body: ratesBody, headers: ratesRes.headers },
          reputation: { status: repRes.status, body: repBody, headers: repRes.headers },
        },
        markup,
      };
    };

    const empty = await runViewFlow(timestamp);

    assert.equal(empty.responses.anchors.status, 200, "View: Anchors (empty state HTTP status)");
    assert.equal(empty.responses.anchors.body.count, 0, "View: Anchors (empty count contract)");
    assert.match(empty.markup.anchors, /data-evidence-state="empty"/, "View: Anchors (empty state marker)");
    assert.match(empty.markup.anchors, /No anchors are currently persisted\./, "View: Anchors (empty state message)");

    assert.equal(empty.responses.corridors.status, 200, "View: Corridors (empty state HTTP status)");
    assert.equal(empty.responses.corridors.body.count, 0, "View: Corridors (empty count contract)");
    assert.match(empty.markup.corridors, /data-evidence-state="empty"/, "View: Corridors (empty state marker)");
    assert.match(empty.markup.corridors, /No corridors are currently persisted\./, "View: Corridors (empty state message)");

    assert.equal(empty.responses.rates.status, 404, "View: Rates (empty corridor HTTP status)");
    assert.equal(empty.responses.rates.body.error.code, "corridor_not_found", "View: Rates (empty corridor error code)");
    assert.match(empty.markup.rates, /data-evidence-state="unavailable"/, "View: Rates (unpersisted corridor marker)");

    assert.equal(empty.responses.reputation.status, 200, "View: Reputation (empty state HTTP status)");
    assert.equal(empty.responses.reputation.body.count, 0, "View: Reputation (empty count contract)");
    assert.match(empty.markup.reputation, /data-evidence-state="empty"/, "View: Reputation (empty state marker)");
    assert.match(empty.markup.reputation, /No anchors are currently persisted\./, "View: Reputation (empty state message)");

    corridorsData = Object.freeze([
      Object.freeze({
        slug: "usdc-us-brl-br",
        assetCodeFrom: "USDC",
        countryFrom: "US",
        assetCodeTo: "BRL",
        countryTo: "BR",
        anchorCount: 0,
      }),
    ]);
    const emptyObservationsFlow = await runViewFlow(timestamp);
    assert.equal(emptyObservationsFlow.responses.rates.status, 200, "View: Rates (persisted corridor with 0 observations)");
    assert.equal(emptyObservationsFlow.responses.rates.body.sourceCount, 0, "View: Rates (sourceCount is 0)");
    assert.equal(emptyObservationsFlow.responses.rates.body.medianRate, null, "View: Rates (medianRate is null)");
    assert.match(emptyObservationsFlow.markup.rates, /data-evidence-state="empty"/, "View: Rates (empty observations state marker)");
    assert.match(emptyObservationsFlow.markup.rates, /No rate observations are currently persisted for this corridor\./, "View: Rates (empty message)");

    anchorsData = Object.freeze([
      Object.freeze({
        slug: "zeam",
        name: "Zeam",
        homeDomain: "zeam.money",
        status: "LIVE" as const,
        seps: Object.freeze([1, 10, 24, 31, 38]),
        corridorCount: 1,
      }),
      Object.freeze({
        slug: "cowrie",
        name: "Cowrie",
        homeDomain: "cowrie.exchange",
        status: "LIVE" as const,
        seps: Object.freeze([1, 31]),
        corridorCount: 1,
      }),
    ]);

    corridorsData = Object.freeze([
      Object.freeze({
        slug: "usdc-us-brl-br",
        assetCodeFrom: "USDC",
        countryFrom: "US",
        assetCodeTo: "BRL",
        countryTo: "BR",
        anchorCount: 2,
      }),
    ]);

    rateObservations = Object.freeze([
      Object.freeze({
        id: "snap-1",
        anchorSlug: "zeam",
        anchorName: "Zeam",
        rate: "5.123450",
        sourceAmount: "100.00",
        destinationAmount: "512.345",
        fee: "0.50",
        capturedAt: new Date(timestamp.getTime() - 10_000),
      }),
      Object.freeze({
        id: "snap-2",
        anchorSlug: "cowrie",
        anchorName: "Cowrie",
        rate: "5.123460",
        sourceAmount: "100.00",
        destinationAmount: "512.346",
        fee: "0.45",
        capturedAt: new Date(timestamp.getTime() - 12_000),
      }),
    ]);

    reputationData = Object.freeze([
      Object.freeze({
        slug: "zeam",
        name: "Zeam",
        reputationScore: Object.freeze({
          compositeScore: 94,
          scoreBand: "GREEN" as const,
          fillRate7d: 0.99,
          fillRate30d: 0.98,
          fillRate90d: 0.97,
          settleP50Ms: 1200,
          settleP95Ms: 2500,
          slippageP50: 0.001,
          slippageP95: 0.004,
          sampleSize: 120,
          state: "OK" as const,
          computedAt: new Date(timestamp.getTime() - 30_000),
        }),
      }),
      Object.freeze({
        slug: "cowrie",
        name: "Cowrie",
        reputationScore: null,
      }),
    ]);

    const refreshed = await runViewFlow(timestamp);

    assert.equal(refreshed.responses.anchors.status, 200, "View: Anchors (refreshed status)");
    assert.equal(refreshed.responses.anchors.body.count, 2, "View: Anchors (refreshed count)");
    assert.equal(refreshed.responses.anchors.body.anchors[0].name, "Cowrie");
    assert.equal(refreshed.responses.anchors.body.anchors[1].name, "Zeam");
    assert.match(refreshed.markup.anchors, /Zeam/, "View: Anchors (rendered anchor Zeam)");
    assert.match(refreshed.markup.anchors, /Cowrie/, "View: Anchors (rendered anchor Cowrie)");
    assert.doesNotMatch(refreshed.markup.anchors, /data-evidence-state="empty"/, "View: Anchors (not empty)");
    assert.doesNotMatch(refreshed.markup.anchors, /data-evidence-state="unavailable"/, "View: Anchors (not unavailable)");

    assert.equal(refreshed.responses.corridors.status, 200, "View: Corridors (refreshed status)");
    assert.equal(refreshed.responses.corridors.body.count, 1, "View: Corridors (refreshed count)");
    assert.equal(refreshed.responses.corridors.body.corridors[0].slug, "usdc-us-brl-br");
    assert.match(refreshed.markup.corridors, /USDC · US/, "View: Corridors (rendered source asset)");
    assert.match(refreshed.markup.corridors, /BRL · BR/, "View: Corridors (rendered destination asset)");
    assert.doesNotMatch(refreshed.markup.corridors, /data-evidence-state="empty"/, "View: Corridors (not empty)");

    assert.equal(refreshed.responses.rates.status, 200, "View: Rates (refreshed status)");
    assert.equal(refreshed.responses.rates.body.state, "healthy", "View: Rates (state is healthy)");
    assert.equal(refreshed.responses.rates.body.sourceCount, 2, "View: Rates (persisted source count)");
    assert.equal(refreshed.responses.rates.body.medianRate, "5.123455", "View: Rates (computed median)");
    assert.match(refreshed.markup.rates, /5\.123455/, "View: Rates (rendered median rate)");
    assert.match(refreshed.markup.rates, /healthy/, "View: Rates (rendered healthy state badge)");
    assert.doesNotMatch(refreshed.markup.rates, /data-evidence-state="empty"/, "View: Rates (not empty)");

    assert.equal(refreshed.responses.reputation.status, 200, "View: Reputation (refreshed status)");
    assert.equal(refreshed.responses.reputation.body.count, 2, "View: Reputation (refreshed count)");
    assert.equal(refreshed.responses.reputation.body.reputation[0].score, null, "View: Reputation (unevaluated score is null)");
    assert.equal(refreshed.responses.reputation.body.reputation[1].score, 94, "View: Reputation (established score)");
    assert.match(refreshed.markup.reputation, /94/, "View: Reputation (rendered score 94)");
    assert.match(refreshed.markup.reputation, /Established/, "View: Reputation (rendered Established badge)");
    assert.match(refreshed.markup.reputation, /Not yet evaluated/, "View: Reputation (rendered Not yet evaluated badge)");
    assert.doesNotMatch(refreshed.markup.reputation, /data-evidence-state="empty"/, "View: Reputation (not empty)");

    simulateDbFailure = true;

    const stale = await runViewFlow(staleTimestamp);

    assert.equal(stale.responses.rates.status, 200, "View: Rates (stale fallback HTTP 200)");
    assert.equal(stale.responses.rates.headers.get("x-evidence-state"), "stale", "View: Rates (stale header marker)");
    assert.equal(stale.responses.rates.body.medianRate, "5.123455", "View: Rates (retains verified median during outage)");
    assert.equal(stale.responses.rates.body.degraded?.state, "stale", "View: Rates (body degraded state)");
    assert.match(stale.markup.rates, /5\.123455/, "View: Rates (rendered stale median)");

    assert.equal(stale.responses.reputation.status, 200, "View: Reputation (stale fallback HTTP 200)");
    assert.equal(stale.responses.reputation.headers.get("x-evidence-state"), "stale", "View: Reputation (stale header marker)");
    assert.equal(stale.responses.reputation.body.degraded?.state, "stale", "View: Reputation (body degraded state)");
    assert.equal(stale.responses.reputation.body.reputation[1].score, 94, "View: Reputation (retains verified score during outage)");

    assert.equal(stale.responses.anchors.status, 500, "View: Anchors (fails closed on outage)");
    assert.equal(stale.responses.corridors.status, 500, "View: Corridors (fails closed on outage)");
    assert.match(stale.markup.anchors, /data-evidence-state="unavailable"/, "View: Anchors (unavailable on failure)");
    assert.match(stale.markup.corridors, /data-evidence-state="unavailable"/, "View: Corridors (unavailable on failure)");

    const serializedAll = JSON.stringify({
      empty: empty.responses,
      refreshed: refreshed.responses,
      stale: stale.responses,
    });

    assert.doesNotMatch(
      serializedAll,
      /process\.env|DATABASE_URL|SECRET|API_KEY|PRIVATE_KEY|TOKEN/i,
      "Security: Responses must not expose secrets or sensitive environment credentials",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
