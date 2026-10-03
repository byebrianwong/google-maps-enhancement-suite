import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExtPlaceResponse } from "@repo/core";
import { db } from "@/db";
import { places } from "@/db/schema";
import { checkExtensionAuth, toExtPlace } from "@/lib/extension";
import { getPlaces, getTypes } from "@/lib/queries";

const linkBody = z.object({
  placeId: z.string(),
  googleFid: z.string().max(80).nullable(),
  googleName: z.string().max(200).nullable().optional(),
  googlePlaceId: z.string().max(200).nullable().optional(),
});

// POST: link a saved place to a Google Maps place, or unlink it (googleFid null).
export async function POST(req: Request) {
  const denied = await checkExtensionAuth(req);
  if (denied) return denied;
  const parsed = linkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { placeId, googleFid, googleName, googlePlaceId } = parsed.data;

  const [existing] = await db.select({ id: places.id }).from(places).where(eq(places.id, placeId));
  if (!existing) return Response.json({ error: "Unknown place" }, { status: 404 });

  // One Google place maps to at most one saved place.
  if (googleFid) {
    await db
      .update(places)
      .set({ googleFid: null, googleName: null, googlePlaceId: null })
      .where(eq(places.googleFid, googleFid));
  }
  await db
    .update(places)
    .set({
      googleFid,
      googleName: googleFid ? googleName ?? null : null,
      googlePlaceId: googleFid ? googlePlaceId ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(places.id, placeId));
  revalidatePath(`/places/${placeId}`);

  const types = await getTypes();
  const updated = (await getPlaces(types)).find((p) => p.id === placeId)!;
  const body: ExtPlaceResponse = { place: toExtPlace(updated) };
  return Response.json(body);
}
