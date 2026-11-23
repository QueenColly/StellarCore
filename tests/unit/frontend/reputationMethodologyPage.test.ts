import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MIN_REPUTATION_OUTCOMES,
  REPUTATION_BANDS,
  REPUTATION_OUTCOME_WINDOW_DAYS,
  REPUTATION_WEIGHTS,
} from "@/constants/reputation";

const source = readFileSync(
  new URL("../../../app/learn/reputation-methodology/page.tsx", import.meta.url),
  "utf8",
);

test("reputation methodology route uses committed constants", () => {
  assert.match(source, /from "@\/constants\/reputation"/);
  assert.match(source, /REPUTATION_WEIGHTS\.availability/);
  assert.match(source, /REPUTATION_WEIGHTS\.rateFreshness/);
  assert.match(source, /REPUTATION_WEIGHTS\.coverage/);
  assert.match(source, /REPUTATION_WEIGHTS\.transferReliability/);
  assert.match(source, /MIN_REPUTATION_OUTCOMES/);
  assert.match(source, /REPUTATION_OUTCOME_WINDOW_DAYS/);
  assert.match(source, /REPUTATION_BANDS\.greenMinimum/);
  assert.match(source, /REPUTATION_BANDS\.amberMinimum/);
});

test("reputation methodology route states current weights and eligibility", () => {
  const total = REPUTATION_WEIGHTS.availability + REPUTATION_WEIGHTS.rateFreshness + REPUTATION_WEIGHTS.coverage + REPUTATION_WEIGHTS.transferReliability;
  assert.equal(total, 100);
  assert.equal(REPUTATION_WEIGHTS.availability, 20);
  assert.equal(REPUTATION_WEIGHTS.rateFreshness, 15);
  assert.equal(REPUTATION_WEIGHTS.coverage, 15);
  assert.equal(REPUTATION_WEIGHTS.transferReliability, 50);
  assert.equal(MIN_REPUTATION_OUTCOMES, 30);
  assert.equal(REPUTATION_OUTCOME_WINDOW_DAYS, 90);
  assert.equal(REPUTATION_BANDS.greenMinimum, 95);
  assert.equal(REPUTATION_BANDS.amberMinimum, 80);
  assert.match(source, /Not enough verified outcomes/);
  assert.match(source, /At least[\s\S]*?one served corridor/);
  assert.match(source, /At least[\s\S]*?one latest rate observation/);
  assert.match(source, /trusted real-world outcome ingestion is operational/);
});

test("reputation methodology route is accessible and read-only", () => {
  assert.match(source, /id="main-content"/);
  assert.match(source, /<ProductHeader current="dashboard" \/>/);
  assert.match(source, /<nav aria-label="Breadcrumb"/);
  assert.match(source, /aria-current="page"/);
  assert.match(source, /<caption className="sr-only">Reputation scoring components and weights<\/caption>/);
  assert.match(source, /href="\/docs\/reputation-methodology\.md"/);
  assert.match(source, /href="\/dashboard"/);
  assert.doesNotMatch(source, /fetch\(|getAnchorReputationApiResult|getReputationApiResult|prisma\.|predict\s+score|simulate\s+score/i);
});
