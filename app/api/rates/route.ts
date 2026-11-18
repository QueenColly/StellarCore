import { handleRatesRequest } from "@/lib/api/requestHandlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleRatesRequest(request);
}
