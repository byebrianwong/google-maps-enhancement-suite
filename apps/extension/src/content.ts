// Runs on Google Maps pages. Shows a small panel with your rating for the
// place that is open, and puts it into the place's note in your lists.
//
// With one of your lists open, "Update all notes in this list" goes through
// every place in it: it fills in each note and presses Done, linking places
// to the app on the way when the match is clear (bulk.ts, list-page.ts). The
// popup's "Update all lists" opens each list you have opened before and does
// the same there.
//
// For a single place you can still do it by hand: click into the place's
// note, press "Fill note" (or the keyboard shortcut), then press Done in
// Google Maps. That way depends only on the field you are typing in.
//
// You pick which of your Google Maps lists the note is for. "All types"
// writes one line per type. One type's list, say "Dog parks", writes that
// type's score and, if the type is set to, each of its ratings. When a list
// is open whose name matches a type's list name, that type is picked for
// you. The choice is remembered, because you usually go through one list at
// a time.

import {
  buildNote,
  flattenNote,
  formatShortDate,
  matchPlace,
  mergeNote,
  moons,
  noteInputFor,
  parseGoogleMapsUrl,
  sameName,
  typeForListTitle,
  type ExtPlace,
  type NoteTarget,
  type ExtPlacesResponse,
  type GooglePlaceRef,
  type MatchResult,
} from "@repo/core";
import { emptySummary, updateListNotes, type ListSummary } from "./bulk";
import { deepActiveElement, isEditable, isSearchBox, readValue, writeValue } from "./fields";
import { describePage, findListPanel, looksLikeListUrl, waitFor, type ListPanel } from "./list-page";
import { DEFAULT_CONFIG, send, type Config, type ListTurn, type TabMessage } from "./messages";
import { PANEL_CSS } from "./panel-css";

declare global {
  interface Window {
    __mapsEnhancementSuiteLoaded?: boolean;
  }
}

if (!window.__mapsEnhancementSuiteLoaded) {
  window.__mapsEnhancementSuiteLoaded = true;
  main();
}

const COLLAPSED_KEY = "mapsEnhancementSuite.parkPicker.collapsed";
const NOTE_TARGET_KEY = "noteTarget"; // in chrome.storage.local

type Status = { text: string; tone: "ok" | "warn" };

type Run = { title: string; done: number; total: number; name: string; stop: boolean };

type State = {
  href: string;
  placeKey: string | null;
  ref: GooglePlaceRef | null;
  config: Config;
  data: ExtPlacesResponse | null;
  error: string | null;
  loading: boolean;
  busy: boolean;
  collapsed: boolean;
  status: Status | null;
  addTypeIds: string[] | null; // null means "all types"
  rejected: Set<string>; // "placeKey|appPlaceId" pairs the person said were wrong
  noteTarget: NoteTarget; // which list the note is for
  list: ListPanel | null; // the Google Maps list open on the page
  listMissingSince: number | null; // when the address started to look like a list with no notes found
  autoTargetFor: string | null; // the list title the note target was last picked for
  run: Run | null; // updating every note in the list
  turn: ListTurn | null; // this tab is part of "Update all lists"
  summary: ListSummary | null; // how the last run went
  allSummaries: ListSummary[] | null; // how "Update all lists" went
};

function main() {
  const host = document.createElement("div");
  host.id = "maps-enhancement-suite";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PANEL_CSS;
  const panel = document.createElement("div");
  panel.className = "panel";
  root.append(style, panel);
  document.documentElement.append(host);

  // Clicking the panel would normally move focus away from the note field.
  // Cancelling mousedown keeps the cursor where it was.
  panel.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("button")) e.preventDefault();
  });

  let lastEditable: HTMLElement | null = null;
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLElement && isEditable(t) && !host.contains(t)) lastEditable = t;
    },
    true,
  );

  const state: State = {
    href: "",
    placeKey: null,
    ref: null,
    config: DEFAULT_CONFIG,
    data: null,
    error: null,
    loading: false,
    busy: false,
    collapsed: false,
    status: null,
    addTypeIds: null,
    rejected: new Set(),
    noteTarget: "all",
    list: null,
    listMissingSince: null,
    autoTargetFor: null,
    run: null,
    turn: null,
    summary: null,
    allSummaries: null,
  };

  try {
    state.collapsed = sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {}
  chrome.storage.local
    .get(NOTE_TARGET_KEY)
    .then((stored) => {
      const saved = stored[NOTE_TARGET_KEY];
      if (typeof saved === "string" && saved !== state.noteTarget && state.autoTargetFor == null) {
        state.noteTarget = saved;
        render();
      }
    })
    .catch(() => {});

  function setStatus(text: string, tone: Status["tone"] = "ok") {
    state.status = { text, tone };
    render();
  }

  async function load() {
    state.loading = true;
    render();
    const [config, res] = await Promise.all([send({ type: "getConfig" }), send({ type: "getPlaces" })]);
    state.config = config;
    state.loading = false;
    if (res.ok) {
      state.data = res.data;
      state.error = null;
    } else {
      state.error = res.error;
    }
    render();
  }

  function placeKeyFor(ref: GooglePlaceRef): string {
    return ref.fid ?? `${ref.name}@${ref.lat.toFixed(5)},${ref.lng.toFixed(5)}`;
  }

  function onUrlChange() {
    state.href = location.href;
    const ref = parseGoogleMapsUrl(location.href);
    const key = ref ? placeKeyFor(ref) : null;
    if (key === state.placeKey) return; // same place, only the map moved
    state.placeKey = key;
    state.ref = ref;
    state.status = null;
    state.addTypeIds = null;
    if (ref) load();
    else render();
  }

  function currentMatch(): MatchResult<ExtPlace> | null {
    if (!state.ref || !state.data) return null;
    const usable = state.data.places.filter((p) => !state.rejected.has(`${state.placeKey}|${p.id}`));
    return matchPlace(state.ref, usable);
  }

  // The chosen list, or "all" if that type has since been deleted.
  function noteTarget(): NoteTarget {
    const types = state.data?.types ?? [];
    return types.some((t) => t.id === state.noteTarget) ? state.noteTarget : "all";
  }

  function setNoteTarget(target: NoteTarget) {
    state.noteTarget = target;
    state.status = null;
    chrome.storage.local.set({ [NOTE_TARGET_KEY]: target }).catch(() => {});
    render();
  }

  function noteFor(place: ExtPlace): string {
    return buildNote(noteInputFor(place, state.data?.types ?? [], noteTarget()));
  }

  function replacePlace(place: ExtPlace) {
    if (!state.data) return;
    const others = state.data.places
      .filter((p) => p.id !== place.id)
      .map((p) => (place.googleFid && p.googleFid === place.googleFid ? { ...p, googleFid: null } : p));
    state.data = { ...state.data, places: [...others, place] };
  }

  async function link(place: ExtPlace) {
    const ref = state.ref;
    if (!ref) return;
    if (!ref.fid) {
      setStatus("This Google Maps link has no place id, so it can't be linked. Open the place from search or a list.", "warn");
      return;
    }
    state.busy = true;
    render();
    const res = await send({
      type: "link",
      body: { placeId: place.id, googleFid: ref.fid, googleName: ref.name, googlePlaceId: ref.placeId },
    });
    state.busy = false;
    if (res.ok) {
      replacePlace(res.data.place);
      setStatus(`Linked to ${res.data.place.name}.`);
    } else {
      setStatus(res.error, "warn");
    }
  }

  async function create() {
    const ref = state.ref;
    if (!ref || !state.data) return;
    const typeIds = state.addTypeIds ?? state.data.types.map((t) => t.id);
    if (typeIds.length === 0) {
      setStatus("Pick at least one type.", "warn");
      return;
    }
    state.busy = true;
    render();
    const res = await send({
      type: "create",
      body: { name: ref.name, lat: ref.lat, lng: ref.lng, typeIds, googleFid: ref.fid, googlePlaceId: ref.placeId },
    });
    state.busy = false;
    if (res.ok) {
      replacePlace(res.data.place);
      setStatus("Added. Rate it in the app to get moons here.");
    } else {
      setStatus(res.error, "warn");
    }
  }

  function linkedPlace(): ExtPlace | null {
    const m = currentMatch();
    return m?.kind === "linked" ? m.place : null;
  }

  function fill() {
    const place = linkedPlace();
    if (!place) {
      setStatus("Link this place first.", "warn");
      return;
    }
    const target = pickTarget(host, lastEditable);
    if (!target) {
      setStatus("Click into the place's note field in Google Maps first, then press Fill note.", "warn");
      return;
    }
    if (isSearchBox(target)) {
      setStatus("That's the search box. Click into the place's note field first.", "warn");
      return;
    }
    const existing = readValue(target);
    let next = mergeNote(existing, noteFor(place));
    if (target instanceof HTMLInputElement) next = flattenNote(next);
    if (next === existing) {
      setStatus("The note is already up to date.");
      return;
    }
    writeValue(target, next);
    setStatus("Filled. Press Done in Google Maps to save it.");
  }

  async function copy() {
    const place = linkedPlace();
    if (!place) return;
    try {
      await navigator.clipboard.writeText(noteFor(place));
      setStatus("Copied.");
    } catch {
      setStatus("Couldn't copy. Use Fill note instead.", "warn");
    }
  }

  // ---- the open list -------------------------------------------------------

  // Looks for a list on the page. Google draws it a moment after the
  // address changes, so this runs every second.
  function detectList() {
    if (state.run) return;
    const found = findListPanel();
    const missing = !found && looksLikeListUrl(location.href);
    state.listMissingSince = missing ? state.listMissingSince ?? Date.now() : null;
    const changed = (found?.title ?? null) !== (state.list?.title ?? null);
    state.list = found;
    if (changed) {
      state.summary = null;
      state.allSummaries = null;
      if (found) onListOpened(found);
    }
    if (changed || missing) render();
  }

  async function onListOpened(list: ListPanel) {
    if (!state.data) await load();
    const type = typeForListTitle(list.title, state.data?.types ?? []);
    if (!type || state.list?.title !== list.title) return;
    if (state.autoTargetFor !== list.title) {
      state.autoTargetFor = list.title;
      if (state.noteTarget !== type.id) setNoteTarget(type.id);
    }
    // Remember the list's address for "Update all lists". An address that
    // is only a map position would not open the list again.
    if (!parseGoogleMapsUrl(location.href) && /\/data=|\/placelists\//.test(location.href)) {
      send({ type: "rememberList", list: { typeId: type.id, title: list.title, url: location.href } }).catch(() => {});
    }
  }

  async function runList(list: ListPanel, target: NoteTarget): Promise<ListSummary> {
    state.run = { title: list.title, done: 0, total: 0, name: "", stop: false };
    state.summary = null;
    state.allSummaries = null;
    state.status = null;
    render();
    let summary: ListSummary;
    try {
      summary = await updateWith(list, target);
    } catch (err) {
      summary = emptySummary(list.title, `Something went wrong: ${(err as Error).message}`);
    }
    state.run = null;
    state.summary = summary;
    state.list = findListPanel();
    render();
    return summary;
  }

  async function updateWith(list: ListPanel, target: NoteTarget): Promise<ListSummary> {
    const res = await send({ type: "getPlaces" });
    if (!res.ok) return emptySummary(list.title, res.error);
    state.data = res.data;
    return updateListNotes(list, {
      data: res.data,
      target,
      shouldStop: () => state.run?.stop ?? true,
      onProgress: (done, total, name) => {
        if (state.run) state.run = { ...state.run, done, total, name };
        render();
      },
      link: async (body) => {
        const linked = await send({ type: "link", body });
        if (!linked.ok) return { error: linked.error };
        replacePlace(linked.data.place);
        return linked.data.place;
      },
      rejected: (ref, placeId) => state.rejected.has(`${placeKeyFor(ref)}|${placeId}`),
    });
  }

  function startRun() {
    const list = findListPanel();
    if (!list) {
      setStatus("Couldn't find the list on the page any more.", "warn");
      return;
    }
    runList(list, noteTarget());
  }

  // This tab was opened by "Update all lists": update the list it shows.
  async function runTurn(turn: ListTurn) {
    state.turn = turn;
    render();
    const wanted = (p: ListPanel | null) => (p && sameName(p.title, turn.list.title) ? p : null);
    const list = await waitFor(() => wanted(findListPanel()), 30_000);
    let summary: ListSummary;
    if (list) {
      summary = await runList(list, turn.list.typeId);
    } else {
      const other = findListPanel();
      summary = emptySummary(
        turn.list.title,
        other
          ? `Expected the list "${turn.list.title}" but "${other.title}" opened.`
          : "The list didn't open. Open it in Google Maps once more so the extension saves its current address.",
      );
      state.summary = summary;
    }
    await send({ type: "listDone", summary });
  }

  async function copyPageDetails() {
    try {
      await navigator.clipboard.writeText(describePage());
      setStatus("Copied what the extension sees on this page. Paste it into a bug report.");
    } catch {
      setStatus("Couldn't copy.", "warn");
    }
  }

  // ---- rendering ----------------------------------------------------------

  function render() {
    panel.replaceChildren();
    panel.classList.toggle("collapsed", state.collapsed);

    const run = state.run;
    const head = el("div", { class: "head" }, [
      el("span", { class: "brand" }, [run && run.total ? `🌙 Park Picker · ${run.done + 1}/${run.total}` : "🌙 Park Picker"]),
      state.collapsed || run ? null : iconButton("↻", "Reload ratings from the app", () => load()),
      iconButton(state.collapsed ? "▾" : "▴", state.collapsed ? "Show" : "Hide", () => {
        state.collapsed = !state.collapsed;
        try {
          sessionStorage.setItem(COLLAPSED_KEY, state.collapsed ? "1" : "0");
        } catch {}
        render();
      }),
    ]);
    panel.append(head);
    if (state.collapsed) return;

    const body = el("div", { class: "body" });
    panel.append(body);

    if (state.turn || run || state.list || state.summary || state.allSummaries) renderList(body);
    if (state.turn || run) return;

    if (!state.ref) {
      if (!state.list && !state.summary && !state.allSummaries) renderNoPlace(body);
      appendStatus(body);
      return;
    }
    if (state.error) {
      body.append(
        el("div", { class: "error" }, [state.error]),
        el("div", { class: "actions" }, [
          button("Settings", () => send({ type: "openOptions" })),
          button("Try again", () => load()),
        ]),
      );
      return;
    }
    if (!state.data) {
      body.append(el("div", { class: "muted" }, ["Loading…"]));
      return;
    }

    const match = currentMatch()!;
    if (match.kind === "linked") renderLinked(body, match.place);
    else if (match.kind === "likely") renderLikely(body, match.place, match.meters);
    else renderNone(body, match.nearby);

    appendStatus(body);
  }

  function appendStatus(body: HTMLElement) {
    if (state.status) body.append(el("div", { class: `status ${state.status.tone}` }, [state.status.text]));
  }

  function renderNoPlace(body: HTMLElement) {
    if (state.listMissingSince != null && Date.now() - state.listMissingSince > 4000) {
      body.append(
        el("div", { class: "muted" }, [
          "This looks like one of your lists, but the extension can't find the notes in it. Google may have changed the page.",
        ]),
        el("div", { class: "actions" }, [button("Copy page details", copyPageDetails)]),
      );
      return;
    }
    body.append(el("div", { class: "muted" }, ["Open one of your lists to update its notes, or open a place to see your rating for it."]));
  }

  function noteChips(): HTMLElement {
    const target = noteTarget();
    return el("div", { class: "chips", role: "group", "aria-label": "Note for which list" }, [
      chip("All types", target === "all", () => setNoteTarget("all"), "One line per type, for lists that mix types"),
      ...(state.data?.types ?? []).map((t) =>
        chip(`${t.emoji} ${t.listName}`, target === t.id, () => setNoteTarget(t.id), `For your "${t.listName}" list in Google Maps`),
      ),
    ]);
  }

  function renderList(body: HTMLElement) {
    const box = el("div", { class: "list" });
    body.append(box);
    if (state.turn) {
      box.append(el("div", { class: "label" }, [`Updating all lists · ${state.turn.position} of ${state.turn.count}`]));
    }

    const run = state.run;
    if (run) {
      const stop = () => {
        if (state.run && !state.run.stop) {
          state.run.stop = true;
          render();
        }
      };
      const stopButton = button(run.stop ? "Stopping…" : "Stop", stop, { disabled: run.stop });
      // The panel is redrawn after each place; acting on pointerdown means a
      // redraw between press and release can't lose the click.
      stopButton.addEventListener("pointerdown", stop);
      box.append(
        el("div", { class: "title" }, [`📋 ${run.title || "This list"}`]),
        el("div", { class: "bar" }, [el("div", { class: "fill", style: `width: ${run.total ? (100 * run.done) / run.total : 0}%` })]),
        el("div", { class: "muted" }, [run.total ? `${run.done + 1} of ${run.total} · ${run.name}` : "Loading every place in the list…"]),
        el("div", { class: "actions" }, [stopButton]),
        // Chrome slows down timers in background tabs.
        el("div", { class: "muted" }, ["Keep this tab in front until it's done."]),
      );
      return;
    }
    if (state.turn) {
      if (state.summary) {
        renderSummary(box, state.summary);
        if (state.turn.position < state.turn.count) box.append(el("div", { class: "muted" }, ["Opening the next list…"]));
      } else {
        box.append(el("div", { class: "muted" }, [`Opening ${state.turn.list.title}…`]));
      }
      return;
    }

    const list = state.list;
    if (list) {
      const type = typeForListTitle(list.title, state.data?.types ?? []);
      box.append(el("div", { class: "title" }, [`📋 ${list.title || "This list"}`]));
      if (state.error && !state.ref) {
        box.append(
          el("div", { class: "error" }, [state.error]),
          el("div", { class: "actions" }, [
            button("Settings", () => send({ type: "openOptions" })),
            button("Try again", () => load()),
          ]),
        );
      } else if (!state.error) {
        add(
          box,
          el("div", { class: "label" }, ["Note for"]),
          noteChips(),
          type
            ? null
            : el("div", { class: "muted" }, [
                `No type's Google Maps list is called "${list.title}", so check which note to write. List names are set in the app's type settings.`,
              ]),
          el("div", { class: "actions" }, [
            button(state.summary ? "Update again" : "Update all notes in this list", startRun, {
              primary: true,
              disabled: !state.data,
            }),
          ]),
          el("div", { class: "muted" }, [
            "Fills in each place's note and presses Done for you. Places not linked to the app yet are opened once to link them.",
          ]),
        );
      }
    }
    for (const s of state.allSummaries ?? (state.summary ? [state.summary] : [])) renderSummary(box, s);
  }

  function renderSummary(box: HTMLElement, s: ListSummary) {
    const counts = [
      s.updated.length ? `${s.updated.length} updated` : null,
      s.unchanged.length ? `${s.unchanged.length} already up to date` : null,
      s.skipped.length ? `${s.skipped.length} skipped` : null,
    ].filter(Boolean);
    const headline = s.error ?? (s.stopped ? "Stopped." : counts.length ? "Done." : "No places to update.");
    const warn = !!s.error || s.skipped.length > 0;
    const section = el("div", { class: "summary" }, [
      el("div", { class: `status ${warn ? "warn" : "ok"}` }, [
        el("b", {}, [s.list || "This list"]),
        ` · ${headline}${counts.length ? ` ${counts.join(", ")}.` : ""}`,
      ]),
    ]);
    if (s.linked.length) section.append(el("div", { class: "muted" }, [`Linked to the app: ${s.linked.join(", ")}.`]));
    if (s.wrongType.length) {
      section.append(
        el("div", { class: "muted" }, [`Not this list's type in the app, so the note has no score: ${s.wrongType.join(", ")}.`]),
      );
    }
    if (s.skipped.length) {
      section.append(
        el(
          "ul",
          { class: "skipped" },
          s.skipped.map((x) => el("li", {}, [el("b", {}, [x.name]), `: ${x.reason}`])),
        ),
      );
    }
    if (s.error || s.skipped.some((x) => x.page)) {
      section.append(el("div", { class: "actions" }, [button("Copy page details", copyPageDetails)]));
    }
    box.append(section);
  }

  function renderLinked(body: HTMLElement, place: ExtPlace) {
    const allTypes = state.data?.types ?? [];
    const types = allTypes.filter((t) => place.typeIds.includes(t.id));
    const target = noteTarget();
    const targetType = allTypes.find((t) => t.id === target);
    add(
      body,
      el("div", { class: "title" }, [
        el("a", { href: `${state.config.appUrl}/places/${place.id}`, target: "_blank", rel: "noopener" }, [place.name]),
      ]),
      el(
        "div",
        { class: "rows" },
        types.map((t) => {
          const s = place.scores[t.id];
          return el("div", { class: "row" }, [
            t.emoji,
            s == null ? el("span", { class: "none" }, ["not rated yet"]) : moons(s),
            s == null ? null : el("span", { class: "score" }, [s.toFixed(1)]),
          ]);
        }),
      ),
      el("div", { class: "muted" }, [
        place.lastVisitAt ? `Last visit ${formatShortDate(place.lastVisitAt)}` : "No visits logged",
      ]),
      // With a list open, its section above already has these.
      state.list ? null : el("div", { class: "label" }, ["Note for"]),
      state.list ? null : noteChips(),
      el("pre", { class: "note", "aria-label": "The note Fill writes" }, [noteFor(place)]),
      el("div", { class: "actions" }, [
        button("Fill note", fill, { primary: true, title: "Fill the note field you clicked into (Alt+Shift+M)" }),
        button("Copy", copy),
      ]),
      el("div", { class: "muted" }, [
        "In your Google Maps list, click this place's note, then press Fill note or Alt+Shift+M. Then press Done.",
      ]),
    );
    if (targetType && !place.typeIds.includes(targetType.id)) {
      body.querySelector("pre.note")?.before(
        el("div", { class: "status warn" }, [`${place.name} isn't a ${targetType.name} in Park Picker, so this note has no score.`]),
      );
    }
  }

  function renderLikely(body: HTMLElement, place: ExtPlace, meters: number) {
    body.append(
      el("div", {}, ["Looks like ", el("b", {}, [place.name]), ` in Park Picker, ${formatMeters(meters)} away.`]),
      el("div", { class: "actions" }, [
        button("Link", () => link(place), { primary: true, disabled: state.busy }),
        button("Not this one", () => {
          state.rejected.add(`${state.placeKey}|${place.id}`);
          render();
        }),
      ]),
    );
  }

  function renderNone(body: HTMLElement, nearby: { place: ExtPlace; meters: number }[]) {
    const ref = state.ref!;
    const types = state.data?.types ?? [];
    const selected = state.addTypeIds ?? types.map((t) => t.id);
    body.append(el("div", {}, [el("b", {}, [ref.name]), " isn't in Park Picker yet."]));
    if (nearby.length > 0) {
      body.append(
        el("div", { class: "muted" }, ["Or link it to a place you already saved:"]),
        el(
          "div",
          { class: "nearby" },
          nearby.map((n) =>
            button(`Link to ${n.place.name} · ${formatMeters(n.meters)}`, () => link(n.place), { disabled: state.busy }),
          ),
        ),
      );
    }
    body.append(
      el("div", { class: "muted" }, ["Add it as:"]),
      el(
        "div",
        { class: "chips" },
        types.map((t) => {
          const on = selected.includes(t.id);
          const b = el("button", { class: "chip", "aria-pressed": String(on), type: "button" }, [`${t.emoji} ${t.name}`]);
          b.addEventListener("click", () => {
            state.addTypeIds = on ? selected.filter((x) => x !== t.id) : [...selected, t.id];
            render();
          });
          return b;
        }),
      ),
      el("div", { class: "actions" }, [
        button("Add to Park Picker", create, { primary: true, disabled: state.busy || selected.length === 0 }),
      ]),
    );
  }

  // ---- start --------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg: TabMessage) => {
    if (msg.type === "fill-note") fill();
    if (msg.type === "allListsDone") {
      state.turn = null;
      state.summary = null;
      state.allSummaries = msg.summaries;
      render();
    }
  });
  // Google Maps changes the URL without reloading the page. While a list is
  // being updated, places open and close; the panel catches up afterwards.
  setInterval(() => {
    if (location.href !== state.href && !state.run) onUrlChange();
  }, 400);
  setInterval(detectList, 1000);
  // Ratings may have changed in the app while this tab was in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (state.ref || state.list) && !state.run) load();
  });
  onUrlChange();
  render();
  send({ type: "tabReady" })
    .then((turn) => {
      if (turn) runTurn(turn);
    })
    .catch(() => {});
}

// ---- helpers ----------------------------------------------------------------

type Child = Node | string | null | undefined;

function el(tag: string, attrs: Record<string, string> = {}, children: Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  add(node, ...children);
  return node;
}

function add(parent: HTMLElement, ...children: Child[]) {
  for (const c of children) if (c != null) parent.append(c);
}

function button(
  label: string,
  onClick: () => void,
  opts: { primary?: boolean; disabled?: boolean; title?: string } = {},
): HTMLElement {
  const b = el("button", { class: `btn${opts.primary ? " primary" : ""}`, type: "button" }, [label]) as HTMLButtonElement;
  if (opts.title) b.title = opts.title;
  b.disabled = !!opts.disabled;
  b.addEventListener("click", onClick);
  return b;
}

function chip(label: string, on: boolean, onClick: () => void, title: string): HTMLElement {
  const b = el("button", { class: "chip", type: "button", "aria-pressed": String(on), title }, [label]);
  b.addEventListener("click", onClick);
  return b;
}

function iconButton(label: string, title: string, onClick: () => void): HTMLElement {
  const b = el("button", { class: "icon-btn", type: "button", title, "aria-label": title }, [label]);
  b.addEventListener("click", onClick);
  return b;
}

function formatMeters(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// The field to fill: the focused one, or the last one focused if the click
// on the panel took focus away anyway.
function pickTarget(host: HTMLElement, lastEditable: HTMLElement | null): HTMLElement | null {
  const active = deepActiveElement();
  if (active && active !== host && !host.contains(active) && isEditable(active)) return active;
  if (lastEditable?.isConnected) return lastEditable;
  return null;
}
