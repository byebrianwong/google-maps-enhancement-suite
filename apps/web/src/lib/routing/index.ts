import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { travelTimes } from "@/db/schema";
import type { LatLng } from "@repo/core";
import type { TravelMode } from "@repo/core";
import { estimateProvider } from "./estimate";
import { googleProvider } from "./google";
import { osrmProvider } from "./osrm";
import type { RoutingProvider, TravelResult } from "./types";

// Cache lifetime for a stored travel time. Roads do not change much, so a
// week is fine. "Refresh" in the UI forces a recompute.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK = 25;

export function providerFor(mode: TravelMode): RoutingProvider {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) return googleProvider(key);
  if (mode === "drive") return osrmProvider;
  return estimateProvider;
}

export function providerLabel(): string {
  if (process.env.GOOGLE_MAPS_API_KEY) return "Google Routes (traffic-aware)";
  return "OSRM for driving, distance estimate for walking and biking";
}

async function computeMatrix(origin: LatLng, dests: LatLng[], mode: TravelMode) {
  const provider = providerFor(mode);
  const results: TravelResult[] = [];
  let name = provider.name;
  for (let i = 0; i < dests.length; i += CHUNK) {
    const chunk = dests.slice(i, i + CHUNK);
    try {
      results.push(...(await provider.matrix(origin, chunk, mode)));
    } catch (err) {
      console.warn(`[routing] ${provider.name} failed, using estimate:`, (err as Error).message);
      name = "estimate";
      results.push(...(await estimateProvider.matrix(origin, chunk, mode)));
    }
  }
  return { results, provider: name };
}

export type TravelInfo = { seconds: number; meters: number; provider: string; cached: boolean };

// Travel times from an origin to a set of places. If originId is given the
// results are cached in the database. Pass force to ignore the cache.
export async function getTravelTimes(opts: {
  originId?: string;
  origin: LatLng;
  places: { id: string; lat: number; lng: number }[];
  mode: TravelMode;
  force?: boolean;
}): Promise<Record<string, TravelInfo | null>> {
  const out: Record<string, TravelInfo | null> = {};
  const missing: typeof opts.places = [];

  if (opts.originId && !opts.force && opts.places.length > 0) {
    const rows = await db
      .select()
      .from(travelTimes)
      .where(
        and(
          eq(travelTimes.originId, opts.originId),
          eq(travelTimes.mode, opts.mode),
          inArray(travelTimes.placeId, opts.places.map((p) => p.id)),
        ),
      );
    const fresh = new Map(
      rows
        .filter((r) => Date.now() - r.computedAt.getTime() < TTL_MS)
        .map((r) => [r.placeId, r]),
    );
    for (const p of opts.places) {
      const r = fresh.get(p.id);
      if (r) out[p.id] = { seconds: r.seconds, meters: r.meters, provider: r.provider, cached: true };
      else missing.push(p);
    }
  } else {
    missing.push(...opts.places);
  }

  if (missing.length > 0) {
    const { results, provider } = await computeMatrix(opts.origin, missing, opts.mode);
    const now = new Date();
    for (let i = 0; i < missing.length; i++) {
      const r = results[i];
      const p = missing[i];
      if (!r) {
        out[p.id] = null;
        continue;
      }
      out[p.id] = { ...r, provider, cached: false };
      if (opts.originId) {
        await db
          .insert(travelTimes)
          .values({
            originId: opts.originId,
            placeId: p.id,
            mode: opts.mode,
            seconds: r.seconds,
            meters: r.meters,
            provider,
            computedAt: now,
          })
          .onConflictDoUpdate({
            target: [travelTimes.originId, travelTimes.placeId, travelTimes.mode],
            set: { seconds: r.seconds, meters: r.meters, provider, computedAt: now },
          });
      }
    }
  }
  return out;
}
