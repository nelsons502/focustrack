export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.ES_URL;
  const apiKey = process.env.ES_API_KEY;

  if (url && apiKey) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `ApiKey ${apiKey}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(2000),
      });
      await response.body?.cancel();
      if (response.ok) return Response.json({ status: "ok" });
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
  }

  return Response.json({ status: "unavailable" }, { status: 503 });
}
