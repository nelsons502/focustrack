import { ApiInputError, searchSessions } from "../../../lib/elastic-search";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(await searchSessions(new URL(request.url).searchParams), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const invalid = error instanceof ApiInputError;
    return Response.json({ error: {
      code: invalid ? "INVALID_INPUT" : "SEARCH_UNAVAILABLE",
      message: invalid ? error.message : "Search is temporarily unavailable. Please try again shortly.",
    } }, { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
