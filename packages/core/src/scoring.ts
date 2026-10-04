export type RatingMap = Record<string, number>; // criterionId -> 1..5

// Only the fields scoring needs, so the web app's database rows and plain
// objects in the extension both fit.
export type WeightedCriterion = { id: string; weight: number };

// How much a criterion counts. 0 means it is still rated and shown, but
// left out of the overall score.
export const MAX_WEIGHT = 5;

// The overall score for one type: the weighted average of the criteria that
// are rated and count (weight above 0). Criteria not rated for this place
// are left out, so a missing rating does not pull the score down.
//
// `rated` and `total` count every criterion, counted or not, so they say how
// complete the place's ratings are. Null if nothing that counts is rated.
export function scoreForType(
  ratingMap: RatingMap,
  typeCriteria: WeightedCriterion[],
): { score: number; rated: number; total: number } | null {
  let sum = 0;
  let weightSum = 0;
  let rated = 0;
  for (const c of typeCriteria) {
    const v = ratingMap[c.id];
    if (v == null) continue;
    rated++;
    if (!(c.weight > 0)) continue;
    sum += v * c.weight;
    weightSum += c.weight;
  }
  if (weightSum === 0) return null;
  return { score: sum / weightSum, rated, total: typeCriteria.length };
}

// Each criterion's share of the overall score, from 0 to 1, when every
// criterion is rated. Criteria that do not count get 0. If nothing counts,
// every share is 0.
export function weightShares(typeCriteria: WeightedCriterion[]): Record<string, number> {
  const total = typeCriteria.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0);
  const shares: Record<string, number> = {};
  for (const c of typeCriteria) shares[c.id] = total > 0 && c.weight > 0 ? c.weight / total : 0;
  return shares;
}

// "1", "0.75", "2.5": a weight without trailing zeros.
export function formatWeight(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

// Color for a 1..5 score. Red through amber to green.
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#9ca3af";
  if (score >= 4.25) return "#16a34a";
  if (score >= 3.5) return "#65a30d";
  if (score >= 2.75) return "#d97706";
  if (score >= 2) return "#ea580c";
  return "#dc2626";
}

export type TravelMode = "drive" | "walk" | "bike";
export const TRAVEL_MODES: { id: TravelMode; label: string; emoji: string }[] = [
  { id: "drive", label: "Drive", emoji: "🚗" },
  { id: "walk", label: "Walk", emoji: "🚶" },
  { id: "bike", label: "Bike", emoji: "🚲" },
];

// The "go now" fit: given a budget, how much time is left at the place after
// going there and back. Return trip is assumed to take as long as the trip out.
export function timeAtPlace(budgetMinutes: number, oneWayMinutes: number): number {
  return budgetMinutes - 2 * oneWayMinutes;
}

export type SortKey = "best" | "mostTime" | "leastRecent";
export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "best", label: "Best rated" },
  { id: "mostTime", label: "Most time there" },
  { id: "leastRecent", label: "Least recently visited" },
];
