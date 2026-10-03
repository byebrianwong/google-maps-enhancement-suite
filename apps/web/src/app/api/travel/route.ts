import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { origins, places } from "@/db/schema";
import { getTravelTimes, providerLabel } from "@/lib/routing";

const body = z.object({
  originId: z.string().optional(),
  origin: z.object({ lat: z.number(), lng: z.number() }).optional(),
  mode: z.enum(["drive", "walk", "bike"]),
  placeIds: z.array(z.string()).max(500).optional(),
  force: z.boolean().optional(),
});

// POST { originId | origin:{lat,lng}, mode, placeIds? } -> one-way times.
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { originId, mode, placeIds, force } = parsed.data;

  let origin = parsed.data.origin;
  if (originId) {
    const [o] = await db.select().from(origins).where(eq(origins.id, originId));
    if (!o) return Response.json({ error: "unknown origin" }, { status: 404 });
    origin = { lat: o.lat, lng: o.lng };
  }
  if (!origin) return Response.json({ error: "origin required" }, { status: 400 });

  const rows = placeIds
    ? await db.select().from(places).where(inArray(places.id, placeIds))
    : await db.select().from(places);

  const times = await getTravelTimes({ originId, origin, places: rows, mode, force });
  return Response.json({ times, provider: providerLabel() });
}
