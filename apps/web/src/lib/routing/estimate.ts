import { haversineMeters, type LatLng } from "@repo/core";
import type { TravelMode } from "@repo/core";
import type { RoutingProvider, TravelResult } from "./types";

// No network. Straight-line distance times a detour factor, at a typical speed.
// Used when no router is available for the mode.
const SPEED_MPS: Record<TravelMode, number> = {
  drive: 30 * 1000 / 3600, // 30 km/h average urban driving
  bike: 14 * 1000 / 3600,
  walk: 4.8 * 1000 / 3600,
};
const DETOUR = 1.3;

export function estimateOne(origin: LatLng, dest: LatLng, mode: TravelMode): TravelResult {
  const meters = haversineMeters(origin, dest) * DETOUR;
  return { meters: Math.round(meters), seconds: Math.round(meters / SPEED_MPS[mode]) };
}

export const estimateProvider: RoutingProvider = {
  name: "estimate",
  async matrix(origin, destinations, mode) {
    return destinations.map((d) => estimateOne(origin, d, mode));
  },
};
