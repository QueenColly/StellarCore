import { publicApiJsonResponse, respondUnlessRequestAborted } from "@/lib/api/http";
import { getRateLimiter } from "@/lib/api/rateLimiter";
import { getReputationApiResult } from "@/lib/api/reputation";
import { staleEvidenceHeaders } from "@/lib/api/staleEvidence";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return respondUnlessRequestAborted(request, async () => {
    const decision = await getRateLimiter().check(request, Date.now());
    if (!decision.allowed) return decision.response;

    const result = await getReputationApiResult({ signal: request.signal });

    return publicApiJsonResponse(
      result,
      staleEvidenceHeaders("degraded" in result ? result.degraded : undefined),
    );
  });
}
