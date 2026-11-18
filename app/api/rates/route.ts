
import {
  getRatesApiResult,
  type RatesApiDependencies,
} from "@/lib/api/rates";
import {
  publicApiJsonResponse,
  readQueryParameter,
  respondUnlessRequestAborted,
} from "@/lib/api/http";
import { getRateLimiter } from "@/lib/api/rateLimiter";
import { staleEvidenceHeaders } from "@/lib/api/staleEvidence";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  dependencies: RatesApiDependencies = {},
): Promise<Response> {
  return respondUnlessRequestAborted(request, async () => {
    const decision = await getRateLimiter().check(request, Date.now());

    if (!decision.allowed) {
      return decision.response;
    }

    const evaluatedAt = dependencies.now?.() ?? new Date();
    const searchParams = new URL(request.url).searchParams;
    const corridorValues = searchParams.getAll("corridor");

    const hasUnsupportedParameter = [...searchParams.keys()].some(
      (key) => key !== "corridor",
    );

    if (corridorValues.length > 1 || hasUnsupportedParameter) {
      return Response.json(
        {
          error: {
            code: "invalid_query",
            message: "The query parameters are invalid.",
          },
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const corridor = readQueryParameter(searchParams, "corridor");

    const result = await getRatesApiResult(corridor, {
      ...dependencies,
      now: () => evaluatedAt,
      signal: request.signal,
    });

    return publicApiJsonResponse(
      result,
      staleEvidenceHeaders(
        "degraded" in result ? result.degraded : undefined,
      ),
    );
  });
}
