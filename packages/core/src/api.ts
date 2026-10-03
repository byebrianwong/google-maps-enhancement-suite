// The JSON the web app serves to the Chrome extension at /api/ext/*.
// Both sides import these types, so a change here shows up as a type error
// in whichever side has not been updated.

export type ExtType = { id: string; name: string; emoji: string };

export type ExtPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  typeIds: string[];
  scores: Record<string, number | null>; // by type id
  lastVisitAt: number | null; // epoch ms
  googleFid: string | null;
  googleName: string | null;
};

export type ExtPlacesResponse = { types: ExtType[]; places: ExtPlace[] };

export type ExtLinkRequest = {
  placeId: string;
  googleFid: string | null; // null unlinks
  googleName?: string | null;
  googlePlaceId?: string | null;
};

export type ExtCreateRequest = {
  name: string;
  lat: number;
  lng: number;
  typeIds: string[];
  googleFid: string | null;
  googlePlaceId?: string | null;
};

export type ExtPlaceResponse = { place: ExtPlace };

// Turns an ExtPlace into the input buildNote() wants, in the order of types.
export function noteInputFor(place: ExtPlace, types: ExtType[]) {
  return {
    types: types
      .filter((t) => place.typeIds.includes(t.id))
      .map((t) => ({ emoji: t.emoji, score: place.scores[t.id] ?? null })),
    lastVisitAt: place.lastVisitAt,
  };
}
