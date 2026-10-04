import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ExtPlace, ExtType } from "@repo/core";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { PlaceSummary, TypeWithCriteria } from "./queries";

// The Chrome extension calls /api/ext/* with this token in an
// "Authorization: Bearer <token>" header. The token is made the first time
// the Settings page loads, and shown there so you can paste it into the
// extension. Without it, any web page you visit could send requests to the
// app while it runs on localhost.

const KEY = "extensionToken";

export async function getExtensionToken(): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  return row?.value ?? null;
}

export async function getOrCreateExtensionToken(): Promise<string> {
  const existing = await getExtensionToken();
  if (existing) return existing;
  await db
    .insert(settings)
    .values({ key: KEY, value: randomBytes(24).toString("base64url") })
    .onConflictDoNothing();
  return (await getExtensionToken())!;
}

export async function regenerateExtensionToken(): Promise<string> {
  const value = randomBytes(24).toString("base64url");
  await db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  return value;
}

// Returns an error Response if the request is not allowed, or null if it is.
export async function checkExtensionAuth(req: Request): Promise<Response | null> {
  const expected = await getExtensionToken();
  if (!expected) {
    return Response.json({ error: "No extension token yet. Open Settings in the web app to create one." }, { status: 401 });
  }
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Wrong or missing extension token." }, { status: 401 });
  }
  return null;
}

export function toExtType(t: TypeWithCriteria): ExtType {
  return {
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    listName: t.googleListName || t.name,
    noteShowsRatings: t.noteShowsRatings,
    criteria: t.criteria.map((c) => ({ id: c.id, label: c.label })),
  };
}

export function toExtPlace(p: PlaceSummary): ExtPlace {
  const scores: Record<string, number | null> = {};
  for (const typeId of p.typeIds) scores[typeId] = p.scores[typeId]?.score ?? null;
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    typeIds: p.typeIds,
    scores,
    ratings: p.ratingMap,
    lastVisitAt: p.lastVisitAt,
    googleFid: p.googleFid,
    googleName: p.googleName,
  };
}
