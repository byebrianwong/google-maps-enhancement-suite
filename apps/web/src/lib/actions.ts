"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  criteria,
  origins,
  placeTypeTags,
  placeTypes,
  places,
  ratings,
  settings,
  travelTimes,
  visits,
} from "@/db/schema";

const id = () => crypto.randomUUID();

function revalidateAll(placeId?: string) {
  revalidatePath("/");
  revalidatePath("/places");
  revalidatePath("/settings");
  if (placeId) revalidatePath(`/places/${placeId}`);
}

// ---- Places ----------------------------------------------------------------

const placeInput = z.object({
  name: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(200).optional().nullable(),
  typeIds: z.array(z.string()).min(1),
  source: z.enum(["manual", "photon", "overpass"]).default("manual"),
  osmId: z.string().max(40).optional().nullable(),
});

export async function createPlace(raw: z.input<typeof placeInput>) {
  const input = placeInput.parse(raw);
  const placeId = id();
  await db.insert(places).values({
    id: placeId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    address: input.address ?? null,
    source: input.source,
    osmId: input.osmId ?? null,
  });
  await db.insert(placeTypeTags).values(input.typeIds.map((typeId) => ({ placeId, typeId })));
  revalidateAll(placeId);
  return { id: placeId };
}

export async function createPlaceAndOpen(raw: z.input<typeof placeInput>) {
  const { id: placeId } = await createPlace(raw);
  redirect(`/places/${placeId}`);
}

export async function updatePlace(
  placeId: string,
  raw: { name?: string; notes?: string | null; address?: string | null; lat?: number; lng?: number },
) {
  const patch = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      notes: z.string().max(5000).nullable().optional(),
      address: z.string().max(200).nullable().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .parse(raw);
  await db.update(places).set({ ...patch, updatedAt: new Date() }).where(eq(places.id, placeId));
  if (patch.lat != null || patch.lng != null) {
    // Location changed, so cached travel times are wrong.
    await db.delete(travelTimes).where(eq(travelTimes.placeId, placeId));
  }
  revalidateAll(placeId);
}

export async function setPlaceTypes(placeId: string, typeIds: string[]) {
  const ids = z.array(z.string()).min(1).parse(typeIds);
  await db.delete(placeTypeTags).where(eq(placeTypeTags.placeId, placeId));
  await db.insert(placeTypeTags).values(ids.map((typeId) => ({ placeId, typeId })));
  revalidateAll(placeId);
}

export async function deletePlace(placeId: string) {
  await db.delete(places).where(eq(places.id, placeId));
  revalidateAll();
  redirect("/places");
}

// ---- Ratings ---------------------------------------------------------------

export async function setRating(placeId: string, criterionId: string, value: number | null) {
  if (value == null) {
    await db
      .delete(ratings)
      .where(and(eq(ratings.placeId, placeId), eq(ratings.criterionId, criterionId)));
  } else {
    const v = z.number().int().min(1).max(5).parse(value);
    await db
      .insert(ratings)
      .values({ placeId, criterionId, value: v, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [ratings.placeId, ratings.criterionId],
        set: { value: v, updatedAt: new Date() },
      });
  }
  revalidateAll(placeId);
}

// ---- Visits ----------------------------------------------------------------

export async function logVisit(raw: {
  placeId: string;
  typeId?: string | null;
  visitedAt?: number; // epoch ms, defaults to now
  rating?: number | null;
  note?: string | null;
}) {
  const input = z
    .object({
      placeId: z.string(),
      typeId: z.string().nullable().optional(),
      visitedAt: z.number().optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      note: z.string().max(2000).nullable().optional(),
    })
    .parse(raw);
  await db.insert(visits).values({
    id: id(),
    placeId: input.placeId,
    typeId: input.typeId ?? null,
    visitedAt: new Date(input.visitedAt ?? Date.now()),
    rating: input.rating ?? null,
    note: input.note?.trim() || null,
  });
  revalidateAll(input.placeId);
}

export async function deleteVisit(visitId: string, placeId: string) {
  await db.delete(visits).where(eq(visits.id, visitId));
  revalidateAll(placeId);
}

// ---- Origins ---------------------------------------------------------------

const originInput = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().trim().min(1).max(8).default("🏠"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function createOrigin(raw: z.input<typeof originInput>) {
  const input = originInput.parse(raw);
  const existing = await db.select({ id: origins.id }).from(origins).limit(1);
  await db.insert(origins).values({ id: id(), ...input, isDefault: existing.length === 0 });
  revalidateAll();
}

export async function updateOrigin(originId: string, raw: Partial<z.input<typeof originInput>>) {
  const patch = originInput.partial().parse(raw);
  await db.update(origins).set(patch).where(eq(origins.id, originId));
  if (patch.lat != null || patch.lng != null) {
    await db.delete(travelTimes).where(eq(travelTimes.originId, originId));
  }
  revalidateAll();
}

export async function setDefaultOrigin(originId: string) {
  await db.update(origins).set({ isDefault: false });
  await db.update(origins).set({ isDefault: true }).where(eq(origins.id, originId));
  revalidateAll();
}

export async function deleteOrigin(originId: string) {
  await db.delete(origins).where(eq(origins.id, originId));
  const rest = await db.select().from(origins).limit(1);
  if (rest.length > 0 && !rest[0].isDefault) {
    await db.update(origins).set({ isDefault: true }).where(eq(origins.id, rest[0].id));
  }
  revalidateAll();
}

// ---- Settings --------------------------------------------------------------

export async function saveSettings(raw: {
  defaultMode?: string;
  defaultBudgetMinutes?: number;
  minStayMinutes?: number;
}) {
  const input = z
    .object({
      defaultMode: z.enum(["drive", "walk", "bike"]).optional(),
      defaultBudgetMinutes: z.number().int().min(15).max(480).optional(),
      minStayMinutes: z.number().int().min(5).max(240).optional(),
    })
    .parse(raw);
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    await db
      .insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
  }
  revalidateAll();
}

export async function clearTravelCache() {
  await db.delete(travelTimes);
  revalidateAll();
}

// ---- Place types and criteria ---------------------------------------------

export async function createPlaceType(raw: { name: string; emoji: string; color: string }) {
  const input = z
    .object({
      name: z.string().trim().min(1).max(40),
      emoji: z.string().trim().min(1).max(8),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .parse(raw);
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || id().slice(0, 8);
  const count = await db.select({ id: placeTypes.id }).from(placeTypes);
  await db.insert(placeTypes).values({ id: slug, ...input, sort: count.length });
  revalidateAll();
}

export async function deletePlaceType(typeId: string) {
  await db.delete(placeTypes).where(eq(placeTypes.id, typeId));
  revalidateAll();
}

export async function createCriterion(raw: {
  typeId: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  weight?: number;
}) {
  const input = z
    .object({
      typeId: z.string(),
      label: z.string().trim().min(1).max(60),
      lowLabel: z.string().trim().min(1).max(60),
      highLabel: z.string().trim().min(1).max(60),
      weight: z.number().min(0.1).max(5).default(1),
    })
    .parse(raw);
  const existing = await db.select({ id: criteria.id }).from(criteria).where(eq(criteria.typeId, input.typeId));
  await db.insert(criteria).values({ id: `${input.typeId}-${id().slice(0, 8)}`, ...input, sort: existing.length });
  revalidateAll();
}

export async function deleteCriterion(criterionId: string) {
  await db.delete(criteria).where(eq(criteria.id, criterionId));
  revalidateAll();
}

// ---- Google Maps link and the Chrome extension ------------------------------

export async function unlinkGoogle(placeId: string) {
  await db
    .update(places)
    .set({ googleFid: null, googleName: null, googlePlaceId: null, updatedAt: new Date() })
    .where(eq(places.id, placeId));
  revalidateAll(placeId);
}

export async function resetExtensionToken() {
  const { regenerateExtensionToken } = await import("./extension");
  await regenerateExtensionToken();
  revalidatePath("/settings");
}
