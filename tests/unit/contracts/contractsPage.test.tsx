import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import ContractsBrowserPage from "@/app/developers/contracts/page";

exposeReactForClassicJsx();

test("contracts fixture browser renders offline interface and explicit synthetic example warning", () => {
  const markup = renderToStaticMarkup(<ContractsBrowserPage />);

  // Title and breadcrumb
  assert.match(markup, /Public API v1 Contract Fixtures/);
  assert.match(markup, /Breadcrumb/);
  assert.match(markup, /Contracts Fixture Browser/);

  // Synthetic example disclaimer
  assert.match(markup, /Synthetic Contract Example/);
  assert.match(markup, /committed static API v1 contract test samples/);
  assert.match(markup, /not live production evidence/);

  // Offline indicator
  assert.match(markup, /Offline Fixture Reference • 31 Bundled Samples/);

  // Filters and domain options
  assert.match(markup, /Domain:/);
  assert.match(markup, /All Domains/);
  assert.match(markup, /Response State:/);

  // Controls
  assert.match(markup, /Copy JSON/);
  assert.match(markup, /Minify/);

  // Initial fixture selection is rendered
  assert.match(markup, /HTTP 200/);
  assert.match(markup, /Response Payload \(JSON\):/);
});
