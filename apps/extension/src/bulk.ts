// Updates the note of every place in the Google Maps list that is open, one
// place after another, the way you would by hand.
//
// For each place in the list:
// 1. Find its saved place in the app: by Google's id if the list links to
//    the place, else by the Google name stored when it was linked. If
//    neither works, open the place to read its id from the address bar,
//    and link it if it matches a saved place as strongly as the panel's
//    "Looks like…" suggestion does. Otherwise skip it.
// 2. Write its note, keeping the person's own text below ours, and press
//    Done. A note that already says the same is left alone.
//
// How the list page is read and clicked is in list-page.ts.

import {
  buildNote,
  linkedPlacesNamed,
  matchPlace,
  noteInputFor,
  parseGoogleMapsUrl,
  type ExtLinkRequest,
  type ExtPlace,
  type ExtPlacesResponse,
  type GooglePlaceRef,
  type NoteTarget,
} from "@repo/core";
import {
  backToList,
  findItem,
  loadWholeList,
  readPlaceRef,
  refreshPanel,
  sleep,
  updateNote,
  type ListPanel,
} from "./list-page";

export type ListSummary = {
  list: string; // the list's title
  total: number; // places in the list
  updated: string[]; // place names, as in the list
  unchanged: string[];
  linked: string[]; // linked to a saved place during this run
  wrongType: string[]; // in one type's list, but not that type in the app
  // `page` is true when the extension couldn't work the Google Maps page,
  // as opposed to a place that simply isn't in the app.
  skipped: { name: string; reason: string; page: boolean }[];
  stopped: boolean;
  error: string | null; // why the run ended early
};

export type ListRunOptions = {
  data: ExtPlacesResponse;
  target: NoteTarget;
  shouldStop: () => boolean;
  onProgress: (done: number, total: number, name: string) => void;
  link: (body: ExtLinkRequest) => Promise<ExtPlace | { error: string }>;
  // Pairs the person turned down in the panel ("Not this one").
  rejected?: (ref: GooglePlaceRef, placeId: string) => boolean;
};

export function emptySummary(list: string, error: string | null = null): ListSummary {
  return { list, total: 0, updated: [], unchanged: [], linked: [], wrongType: [], skipped: [], stopped: false, error };
}

export async function updateListNotes(start: ListPanel, opts: ListRunOptions): Promise<ListSummary> {
  const summary = emptySummary(start.title);
  const skip = (name: string, reason: string, page = false) => summary.skipped.push({ name, reason, page });
  let places = opts.data.places;
  let panel = start;

  const names = (await loadWholeList(panel, opts.shouldStop)).map((item) => item.name);
  summary.total = names.length;
  if (names.length === 0) {
    summary.error = "Found note boxes in this list, but not the places they belong to.";
    return summary;
  }

  for (const [index, name] of names.entries()) {
    if (opts.shouldStop()) {
      summary.stopped = true;
      break;
    }
    opts.onProgress(index, names.length, name);
    const now = refreshPanel(panel);
    if (!now) {
      summary.error = "The list closed. Open it again and press Update: notes already done are skipped quickly.";
      break;
    }
    panel = now;
    let item = findItem(panel, name, index);
    if (!item) {
      skip(name, "couldn't find it in the list again", true);
      continue;
    }

    // 1. Its saved place.
    let ref: GooglePlaceRef | null = item.href ? parseGoogleMapsUrl(item.href) : null;
    let place: ExtPlace | null = null;
    if (ref?.fid) place = places.find((p) => p.googleFid === ref!.fid) ?? null;
    else {
      const named = linkedPlacesNamed(name, places);
      if (named.length === 1) place = named[0];
    }

    if (!place) {
      if (!ref?.fid) {
        const opened = await readPlaceRef(item);
        const back = await backToList(panel);
        if (!back) {
          summary.error = `Lost the list after opening ${name}. Open the list again and press Update: notes already done are skipped quickly.`;
          break;
        }
        panel = back;
        if (opened === "other place") {
          skip(name, "clicking it opened a different place", true);
          continue;
        }
        if (!opened) {
          skip(name, "couldn't open it to read Google's id for it", true);
          continue;
        }
        ref = opened;
        item = findItem(panel, name, index);
        if (!item) {
          skip(name, "couldn't find it in the list again", true);
          continue;
        }
      }
      const googleRef = ref;
      const usable = opts.rejected ? places.filter((p) => !opts.rejected!(googleRef, p.id)) : places;
      const match = matchPlace(googleRef, usable);
      if (match.kind === "linked") {
        place = match.place;
      } else if (match.kind === "likely") {
        const linked = await opts.link({
          placeId: match.place.id,
          googleFid: googleRef.fid,
          googleName: googleRef.name,
          googlePlaceId: googleRef.placeId,
        });
        if ("error" in linked) {
          skip(name, `couldn't link it: ${linked.error}`);
          continue;
        }
        places = places.map((p) => (p.id === linked.id ? linked : p));
        summary.linked.push(name);
        place = linked;
      } else {
        const near = match.nearby[0]?.place.name;
        skip(name, near ? `not linked yet. Open it to link it, maybe to ${near}.` : "not in Park Picker");
        continue;
      }
    }

    // 2. Its note.
    const note = buildNote(noteInputFor(place, opts.data.types, opts.target));
    if (opts.target !== "all" && !place.typeIds.includes(opts.target)) summary.wrongType.push(name);
    const outcome = await updateNote(panel, item, index, note);
    if (outcome === "updated") summary.updated.push(name);
    else if (outcome === "unchanged") summary.unchanged.push(name);
    else skip(name, outcome.problem, true);
    await sleep(250);
  }
  return summary;
}
