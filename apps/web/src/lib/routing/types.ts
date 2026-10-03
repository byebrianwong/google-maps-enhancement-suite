import type { LatLng } from "@repo/core";
import type { TravelMode } from "@repo/core";

export type TravelResult = { seconds: number; meters: number } | null;

export interface RoutingProvider {
  name: string;
  // One-way travel from origin to each destination, same order as input.
  matrix(origin: LatLng, destinations: LatLng[], mode: TravelMode): Promise<TravelResult[]>;
}
