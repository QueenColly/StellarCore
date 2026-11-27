import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import DirectoryExportPage from "@/app/exports/directory/page";

exposeReactForClassicJsx();

test("directory export page renders accessible controls and proper disclaimers", () => {
  const markup = renderToStaticMarkup(<DirectoryExportPage />);

  // Title and breadcrumb
  assert.match(markup, /Export Reviewed Directories as CSV/);
  assert.match(markup, /Breadcrumb/);
  assert.match(markup, /Directory Export/);

  // Disclaimer: sync status is not live uptime
  assert.match(markup, /sync status reflects the last recorded metadata synchronization/i);
  assert.match(markup, /explicitly not an indicator of live operational uptime or service reliability/i);

  // Both directory choices are present
  assert.match(markup, /Anchor Directory/);
  assert.match(markup, /Corridor Directory/);

  // Buttons are keyboard accessible with ARIA labels
  assert.match(markup, /Export Anchors CSV/);
  assert.match(markup, /Export Corridors CSV/);
  assert.match(markup, /aria-label="Export reviewed anchors as safe CSV"/);
  assert.match(markup, /aria-label="Export reviewed corridors as safe CSV"/);

  // Live region for status updates
  assert.match(markup, /aria-live="polite"/);
});
