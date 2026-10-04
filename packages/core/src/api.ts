import type { NoteInput } from "./note";

// The JSON the web app serves to the Chrome extension at /api/ext/*.
// Both sides import these types, so a change here shows up as a type error
// in whichever side has not been updated.

export type ExtCriterion = { id: string; label: string };

export type ExtType = {
  id: string;
  name: string;
  emoji: string;
  // The name of the matching list in Google Maps, e.g. "Dog parks". Falls
  // back to the type's name when none is set.
  listName: string;
  // Whether a note for this type's list shows each rating below the score.
  noteShowsRatings: boolean;
  criteria: ExtCriterion[]; // in display order
};

export type ExtPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  typeIds: string[];
  scores: Record<string, number | null>; // by type id
  ratings: Record<string, number>; // by criterion id, 1..5
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

// Which note to write. "all" gives one line per type the place has. A type
// id gives the note for that type's Google Maps list.
export type NoteTarget = "all" | (string & {});

// Only the fields a note needs, so the web app's own data fits too.
export type NotePlace = Pick<ExtPlace, "typeIds" | "scores" | "ratings" | "lastVisitAt">;
export type NoteTypeConfig = Pick<ExtType, "id" | "emoji" | "noteShowsRatings" | "criteria">;

// Turns a place into the input buildNote() wants, in the order of types.
// For one type's list, a place that does not have that type gets a note
// that says it is not rated yet.
export function noteInputFor(place: NotePlace, types: NoteTypeConfig[], target: NoteTarget = "all"): NoteInput {
  if (target === "all") {
    return {
      types: types
        .filter((t) => place.typeIds.includes(t.id))
        .map((t) => ({ emoji: t.emoji, score: place.scores[t.id] ?? null })),
      lastVisitAt: place.lastVisitAt,
    };
  }
  const t = types.find((x) => x.id === target);
  if (!t || !place.typeIds.includes(t.id)) return { types: [], lastVisitAt: place.lastVisitAt };
  const ratings = t.noteShowsRatings
    ? t.criteria.flatMap((c) => (place.ratings[c.id] == null ? [] : [{ label: c.label, value: place.ratings[c.id] }]))
    : undefined;
  return {
    types: [{ emoji: t.emoji, score: place.scores[t.id] ?? null, ratings }],
    lastVisitAt: place.lastVisitAt,
  };
}
