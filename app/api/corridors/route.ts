import { getCorridorsApiResult, type CorridorsApiDependencies } from "@/lib/api/corridors";
import { publicApiJsonResponse } from "@/lib/api/http";
import { readPaginationQuery } from "@/lib/api/pagination";
import { getRateLimiter } from "@/lib/api/rateLimiter";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  dependencies: CorridorsApiDependencies = {},
): Promise<Response> {
  const decision = await getRateLimiter().check(request, Date.now());
  if (!decision.allowed) return decision.response;

  return publicApiJsonResponse(await getCorridorsApiResult(
    dependencies,
    readPaginationQuery(new URL(request.url).searchParams),
  ));
}

