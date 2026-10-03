import type { LatLng } from "@repo/core";
import type { RoutingProvider, TravelResult } from "./types";

// Public OSRM demo server. Free, no key, driving only, fair-use rate limits.
// Set OSRM_URL to point at your own OSRM instance.
const BASE = process.env.OSRM_URL ?? "https://router.project-osrm.org";

export const osrmProvider: RoutingProvider = {
  name: "osrm",
  async matrix(origin, destinations, mode) {
    if (mode !== "drive") throw new Error("OSRM demo server only supports driving");
    if (destinations.length === 0) return [];
    const coords = [origin, ...destinations].map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${BASE}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = (await res.json()) as {
      code: string;
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    };
    if (json.code !== "Ok" || !json.durations) throw new Error(`OSRM ${json.code}`);
    const durations = json.durations[0];
    const distances = json.distances?.[0] ?? [];
    return destinations.map((_, i): TravelResult => {
      const s = durations[i + 1];
      const m = distances[i + 1];
      if (s == null) return null;
      return { seconds: Math.round(s), meters: Math.round(m ?? 0) };
    });
  },
};

export type { LatLng };
