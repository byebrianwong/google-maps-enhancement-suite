import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  criteria,
  origins,
  placeTypeTags,
  placeTypes,
  places,
  ratings,
  settings,
  visits,
  type Criterion,
  type Origin,
  type Place,
  type PlaceType,
  type Visit,
} from "@/db/schema";
import { scoreForType, type RatingMap } from "@repo/core";

export type TypeWithCriteria = PlaceType & { criteria: Criterion[] };

export async function getTypes(): Promise<TypeWithCriteria[]> {
  const types = await db.select().from(placeTypes).orderBy(asc(placeTypes.sort), asc(placeTypes.name));
  const crits = await db.select().from(criteria).orderBy(asc(criteria.sort));
  return types.map((t) => ({ ...t, criteria: crits.filter((c) => c.typeId === t.id) }));
}

export type PlaceSummary = Place & {
  typeIds: string[];
  ratingMap: RatingMap;
  scores: Record<string, { score: number; rated: number; total: number } | null>; // by typeId
  lastVisitAt: number | null; // epoch ms
  visitCount: number;
};

export async function getPlaces(types?: TypeWithCriteria[]): Promise<PlaceSummary[]> {
  const allTypes = types ?? (await getTypes());
  const rows = await db.select().from(places).orderBy(asc(places.name));
  const tags = await db.select().from(placeTypeTags);
  const rates = await db.select().from(ratings);
  const visitAgg = await db
    .select({
      placeId: visits.placeId,
      last: sql<number>`max(${visits.visitedAt})`,
      count: sql<number>`count(*)`,
    })
    .from(visits)
    .groupBy(visits.placeId);
  const visitByPlace = new Map(visitAgg.map((v) => [v.placeId, v]));

  return rows.map((p) => {
    const typeIds = tags.filter((t) => t.placeId === p.id).map((t) => t.typeId);
    const ratingMap: RatingMap = {};
    for (const r of rates) if (r.placeId === p.id) ratingMap[r.criterionId] = r.value;
    const scores: PlaceSummary["scores"] = {};
    for (const t of allTypes) scores[t.id] = scoreForType(ratingMap, t.criteria);
    const v = visitByPlace.get(p.id);
    return {
      ...p,
      typeIds,
      ratingMap,
      scores,
      lastVisitAt: v?.last ? Number(v.last) : null,
      visitCount: v?.count ? Number(v.count) : 0,
    };
  });
}

export async function getPlace(id: string): Promise<(PlaceSummary & { visits: Visit[] }) | null> {
  const all = await getPlaces();
  const p = all.find((x) => x.id === id);
  if (!p) return null;
  const vs = await db.select().from(visits).where(eq(visits.placeId, id)).orderBy(desc(visits.visitedAt));
  return { ...p, visits: vs };
}

// How many places have a rating for each criterion, by criterion id.
export async function getRatingCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ criterionId: ratings.criterionId, count: sql<number>`count(*)` })
    .from(ratings)
    .groupBy(ratings.criterionId);
  return Object.fromEntries(rows.map((r) => [r.criterionId, Number(r.count)]));
}

export async function getOrigins(): Promise<Origin[]> {
  return db.select().from(origins).orderBy(desc(origins.isDefault), asc(origins.sort), asc(origins.name));
}

export type Settings = {
  defaultMode: "drive" | "walk" | "bike";
  defaultBudgetMinutes: number;
  minStayMinutes: number;
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings);
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const mode = m.defaultMode;
  return {
    defaultMode: mode === "walk" || mode === "bike" ? mode : "drive",
    defaultBudgetMinutes: Number(m.defaultBudgetMinutes ?? 60) || 60,
    minStayMinutes: Number(m.minStayMinutes ?? 20) || 20,
  };
}
