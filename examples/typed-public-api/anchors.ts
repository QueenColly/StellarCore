import { createClient, formatApiError } from "./client.js";
import type { AnchorResponse, AnchorsResponse } from "./types.js";

async function main() {
  const baseUrl = process.env.STELLARCORE_API_BASE_URL ?? "http://localhost:3000";
  const client = createClient({ baseUrl });

  const list = await client.get<AnchorsResponse>("" + "/api/anchors");
  if (!list.ok) {
    console.error("anchors list failed", formatApiError(list));
    return;
  }
  console.log(`anchors: ${list.data.count}`);
  for (const anchor of list.data.anchors) {
    console.log("-", anchor.slug, anchor.status, anchor.isTransferCapable ? "transfer-capable" : "no-transfer-interface");
  }

  const slug = list.data.anchors[0]?.slug ?? "unknown-anchor";
  const detail = await client.get<AnchorResponse>(`/api/anchors/${encodeURIComponent(slug)}`);
  if (!detail.ok) {
    // 400/404/500 are explicit branches; missing anchor is not treated as empty success.
    console.error("anchor detail failed", formatApiError(detail));
    return;
  }
  console.log("anchor corridors", detail.data.anchor.corridors.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
