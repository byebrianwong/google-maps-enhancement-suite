import { NextRequest } from "next/server";
import { searchPlaces } from "@/lib/search/photon";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : undefined;
  try {
    const results = await searchPlaces(q, near);
    return Response.json({ results });
  } catch (err) {
    return Response.json({ results: [], error: (err as Error).message }, { status: 502 });
  }
}
