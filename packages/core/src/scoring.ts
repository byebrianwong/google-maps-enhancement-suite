export type RatingMap = Record<string, number>; // criterionId -> 1..5

// Only the fields scoring needs, so the web app's database rows and plain
// objects in the extension both fit.
export type WeightedCriterion = { id: string; weight: number };

// Weighted average of the rated criteria for one type. Null if nothing rated.
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
    sum += v * c.weight;
    weightSum += c.weight;
    rated++;
  }
  if (rated === 0 || weightSum === 0) return null;
  return { score: sum / weightSum, rated, total: typeCriteria.length };
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
