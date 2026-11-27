import { createClient, formatApiError } from "./client.js";
import type { ReputationDetailResponse, ReputationListResponse } from "./types.js";

async function main() {
  const baseUrl = process.env.STELLARCORE_API_BASE_URL ?? "http://localhost:3000";
  const client = createClient({ baseUrl });

  const list = await client.get<ReputationListResponse>("/api/reputation");
  if (!list.ok) {
    console.error("reputation list failed", formatApiError(list));
    return;
  }
  for (const rep of list.data.reputation) {
    if (rep.state !== "established" || rep.score === null) {
      console.log(rep.anchor.slug, rep.state, "score unavailable");
    } else {
      console.log(rep.anchor.slug, rep.state, rep.score, rep.scoreBand);
    }
  }

  const slug = list.data.reputation[0]?.anchor.slug ?? "unknown-anchor";
  const detail = await client.get<ReputationDetailResponse>(`/api/reputation/${encodeURIComponent(slug)}`);
  if (!detail.ok) {
    console.error("reputation detail failed", formatApiError(detail));
    return;
  }
  // metrics and evidence may be null; do not coerce to zero.
  console.log(detail.data.reputation.state, detail.data.reputation.evidence?.outcomeCount ?? "no-evidence");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
