import type { LatLng } from "@repo/core";

// Photon: free geocoder over OpenStreetMap data, made for autocomplete.
export type SearchResult = {
  id: string;
  name: string;
  detail: string; // "Golden Gate Park, San Francisco, CA"
  lat: number;
  lng: number;
  kind: string; // e.g. "leisure:park"
  osmId: string;
};

export async function searchPlaces(q: string, near?: LatLng, limit = 8): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: String(limit), lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { "User-Agent": "maps-enhancement-suite/0.1 (personal app; https://github.com/byebrianwong/google-maps-enhancement-suite)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as {
    features: {
      geometry: { coordinates: [number, number] };
      properties: {
        osm_type?: string;
        osm_id?: number;
        osm_key?: string;
        osm_value?: string;
        name?: string;
        street?: string;
        housenumber?: string;
        city?: string;
        state?: string;
        country?: string;
      };
    }[];
  };
  const seen = new Set<string>();
  return json.features
    .filter((f) => f.properties.name || f.properties.street)
    .filter((f) => {
      // Photon sometimes returns the same OSM object under two tags.
      const key = `${f.properties.osm_type}${f.properties.osm_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => {
      const p = f.properties;
      const name = p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ");
      const detail = [p.street && p.name ? p.street : null, p.city, p.state]
        .filter(Boolean)
        .join(", ");
      const osmId = `${p.osm_type ?? "?"}${p.osm_id ?? ""}`;
      return {
        id: osmId || `${f.geometry.coordinates.join(",")}`,
        name,
        detail,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        kind: [p.osm_key, p.osm_value].filter(Boolean).join(":"),
        osmId,
      };
    });
}
