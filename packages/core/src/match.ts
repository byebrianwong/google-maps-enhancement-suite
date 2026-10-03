import { haversineMeters } from "./geo";

// Pairs a place open in Google Maps with a place saved in the app.
//
// Names differ between Google and OpenStreetMap ("Mission Dolores Park" vs
// "Dolores Park"), and so do locations: a big park's pin can be a kilometre
// from the other source's pin. So a match needs either a stored link, or a
// similar name within a couple of kilometres. Anything else is only offered
// as a nearby suggestion.

export type MatchCandidate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  googleFid: string | null;
};

export type MatchResult<T extends MatchCandidate> =
  | { kind: "linked"; place: T }
  | { kind: "likely"; place: T; meters: number; similarity: number }
  | { kind: "none"; nearby: { place: T; meters: number }[] };

// Words that say what kind of place it is, not which one.
const GENERIC = new Set([
  "the", "of", "and", "at", "a",
  "park", "parks", "playground", "garden", "gardens", "square", "plaza",
  "dog", "dogs", "run", "area", "play", "off", "leash", "offleash",
  "field", "fields", "recreation", "rec", "center", "centre",
]);

function tokens(name: string): string[] {
  const all = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const specific = all.filter((t) => !GENERIC.has(t));
  return specific.length > 0 ? specific : all;
}

// Share of the shorter name's words that appear in the longer name. 0 to 1.
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

export const LIKELY_MAX_METERS = 2000;
export const LIKELY_MIN_SIMILARITY = 0.6;
export const NEARBY_MAX_METERS = 400;

export function matchPlace<T extends MatchCandidate>(
  google: { name: string; lat: number; lng: number; fid: string | null },
  places: T[],
): MatchResult<T> {
  if (google.fid) {
    const linked = places.find((p) => p.googleFid === google.fid);
    if (linked) return { kind: "linked", place: linked };
  }
  const scored = places.map((place) => ({
    place,
    meters: haversineMeters(google, place),
    similarity: nameSimilarity(google.name, place.name),
  }));
  const likely = scored
    // A place already linked to some other Google place is not a candidate.
    .filter((s) => !s.place.googleFid && s.meters <= LIKELY_MAX_METERS && s.similarity >= LIKELY_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity || a.meters - b.meters)[0];
  if (likely) return { kind: "likely", place: likely.place, meters: likely.meters, similarity: likely.similarity };
  const nearby = scored
    .filter((s) => !s.place.googleFid && s.meters <= NEARBY_MAX_METERS)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 3)
    .map(({ place, meters }) => ({ place, meters }));
  return { kind: "none", nearby };
}
