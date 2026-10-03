import type { LatLng } from "@repo/core";
import type { TravelMode } from "@repo/core";
import type { RoutingProvider, TravelResult } from "./types";

// Google Routes API, computeRouteMatrix. Traffic-aware for driving.
// Needs GOOGLE_MAPS_API_KEY with the Routes API enabled.
const MODE_MAP: Record<TravelMode, string> = {
  drive: "DRIVE",
  walk: "WALK",
  bike: "BICYCLE",
};

function waypoint(p: LatLng) {
  return { waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } };
}

export function googleProvider(apiKey: string): RoutingProvider {
  return {
    name: "google",
    async matrix(origin, destinations, mode) {
      if (destinations.length === 0) return [];
      const body: Record<string, unknown> = {
        origins: [waypoint(origin)],
        destinations: destinations.map(waypoint),
        travelMode: MODE_MAP[mode],
      };
      if (mode === "drive") {
        body.routingPreference = "TRAFFIC_AWARE";
        body.departureTime = new Date(Date.now() + 60_000).toISOString();
      }
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Google Routes ${res.status}: ${await res.text()}`);
      const rows = (await res.json()) as {
        destinationIndex: number;
        duration?: string; // "123s"
        distanceMeters?: number;
        condition?: string;
      }[];
      const out: TravelResult[] = destinations.map(() => null);
      for (const r of rows) {
        if (r.condition !== "ROUTE_EXISTS" || !r.duration) continue;
        out[r.destinationIndex] = {
          seconds: Math.round(parseFloat(r.duration.replace("s", ""))),
          meters: r.distanceMeters ?? 0,
        };
      }
      return out;
    },
  };
}
