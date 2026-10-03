import { NextRequest } from "next/server";
import { findNearbyParks } from "@/lib/search/overpass";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const radius = Number(req.nextUrl.searchParams.get("radius") ?? 3000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required" }, { status: 400 });
  }
  try {
    const parks = await findNearbyParks({ lat, lng }, radius);
    return Response.json({ parks });
  } catch (err) {
    return Response.json({ parks: [], error: (err as Error).message }, { status: 502 });
  }
}
