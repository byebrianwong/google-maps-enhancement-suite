import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExtPlaceResponse, ExtPlacesResponse } from "@repo/core";
import { db } from "@/db";
import { placeTypeTags, places } from "@/db/schema";
import { checkExtensionAuth, toExtPlace, toExtType } from "@/lib/extension";
import { getPlaces, getTypes } from "@/lib/queries";

// GET: every place with its scores, for the extension to match and annotate.
export async function GET(req: Request) {
  const denied = await checkExtensionAuth(req);
  if (denied) return denied;
  const types = await getTypes();
  const all = await getPlaces(types);
  const body: ExtPlacesResponse = { types: types.map(toExtType), places: all.map(toExtPlace) };
  return Response.json(body);
}

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  typeIds: z.array(z.string()).min(1),
  googleFid: z.string().max(80).nullable(),
  googlePlaceId: z.string().max(200).nullable().optional(),
});

// POST: add a place you found in Google Maps, already linked to it.
export async function POST(req: Request) {
  const denied = await checkExtensionAuth(req);
  if (denied) return denied;
  const parsed = createBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;

  const id = crypto.randomUUID();
  await db.insert(places).values({
    id,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    source: "google",
    googleFid: input.googleFid,
    googleName: input.name,
    googlePlaceId: input.googlePlaceId ?? null,
  });
  await db.insert(placeTypeTags).values(input.typeIds.map((typeId) => ({ placeId: id, typeId })));
  revalidatePath("/");
  revalidatePath("/places");

  const types = await getTypes();
  const created = (await getPlaces(types)).find((p) => p.id === id)!;
  const body: ExtPlaceResponse = { place: toExtPlace(created) };
  return Response.json(body, { status: 201 });
}
