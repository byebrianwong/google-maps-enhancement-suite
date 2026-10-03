import type { LatLng } from "@repo/core";

// Overpass: query OpenStreetMap for parks, dog parks and playgrounds nearby.
export type NearbyPark = {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  kind: string; // park | dog_park | playground | garden
};

export async function findNearbyParks(center: LatLng, radiusMeters = 3000): Promise<NearbyPark[]> {
  const r = Math.min(Math.max(Math.round(radiusMeters), 200), 20000);
  const filter = `["leisure"~"^(park|dog_park|playground|garden)$"]["name"]`;
  const query = `[out:json][timeout:25];
(
  node${filter}(around:${r},${center.lat},${center.lng});
  way${filter}(around:${r},${center.lat},${center.lng});
  relation${filter}(around:${r},${center.lat},${center.lng});
);
out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "maps-enhancement-suite/0.1 (personal app; https://github.com/byebrianwong/google-maps-enhancement-suite)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as {
    elements: {
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  const seen = new Set<string>();
  const out: NearbyPark[] = [];
  for (const el of json.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.name;
    if (lat == null || lng == null || !name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // same park often exists as way + relation
    seen.add(key);
    out.push({
      osmId: `${el.type[0].toUpperCase()}${el.id}`,
      name,
      lat,
      lng,
      kind: el.tags?.leisure ?? "park",
    });
  }
  return out;
}
