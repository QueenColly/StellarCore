import { publicApiJsonResponse, respondUnlessRequestAborted } from "@/lib/api/http";
import { getRateLimiter } from "@/lib/api/rateLimiter";
import { getAnchorReputationApiResult } from "@/lib/api/reputation";
import { staleEvidenceHeaders } from "@/lib/api/staleEvidence";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: Readonly<{ params: Promise<Readonly<{ slug: string }>> }>,
): Promise<Response> {
  return respondUnlessRequestAborted(request, async () => {
    const decision = await getRateLimiter().check(request, Date.now());
    if (!decision.allowed) return decision.response;

    const { slug } = await context.params;
    const result = await getAnchorReputationApiResult(slug, { signal: request.signal });

    return publicApiJsonResponse(
      result,
      staleEvidenceHeaders("degraded" in result ? result.degraded : undefined),
    );
  });
}
