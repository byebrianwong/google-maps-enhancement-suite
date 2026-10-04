// Runs on Google Maps pages. Shows a small panel with your rating for the
// place that is open, and fills it into the note field you are editing.
//
// You pick which of your Google Maps lists the note is for. "All types"
// writes one line per type. One type's list, say "Dog parks", writes that
// type's score and, if the type is set to, each of its ratings. Google's
// page does not say which list you are in, so the choice is yours, and it is
// remembered because you usually go through one list at a time.
//
// It does not click around Google Maps on its own. You open the place's note
// in your list, then press "Fill note" (or the keyboard shortcut). The panel
// writes the moons into that field, keeps your own text below them, and you
// press Done in Google Maps. This way it does not depend on how Google's page
// is built, only on the field you are typing in.

import {
  buildNote,
  flattenNote,
  formatShortDate,
  matchPlace,
  mergeNote,
  moons,
  noteInputFor,
  parseGoogleMapsUrl,
  type ExtPlace,
  type NoteTarget,
  type ExtPlacesResponse,
  type GooglePlaceRef,
  type MatchResult,
} from "@repo/core";
import { DEFAULT_CONFIG, send, type Config, type TabMessage } from "./messages";
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
  };

  try {
    state.collapsed = sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {}
  chrome.storage.local
    .get(NOTE_TARGET_KEY)
    .then((stored) => {
      const saved = stored[NOTE_TARGET_KEY];
      if (typeof saved === "string" && saved !== state.noteTarget) {
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

  function onUrlChange() {
    state.href = location.href;
    const ref = parseGoogleMapsUrl(location.href);
    const key = ref ? ref.fid ?? `${ref.name}@${ref.lat.toFixed(5)},${ref.lng.toFixed(5)}` : null;
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

  // ---- rendering ----------------------------------------------------------

  function render() {
    panel.replaceChildren();
    panel.classList.toggle("collapsed", state.collapsed);

    const head = el("div", { class: "head" }, [
      el("span", { class: "brand" }, ["🌙 Park Picker"]),
      state.collapsed ? null : iconButton("↻", "Reload ratings from the app", () => load()),
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

    if (!state.ref) {
      body.append(el("div", { class: "muted" }, ["Open a place to see your rating for it."]));
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

    if (state.status) body.append(el("div", { class: `status ${state.status.tone}` }, [state.status.text]));
  }

  function renderLinked(body: HTMLElement, place: ExtPlace) {
    const allTypes = state.data?.types ?? [];
    const types = allTypes.filter((t) => place.typeIds.includes(t.id));
    const target = noteTarget();
    const targetType = allTypes.find((t) => t.id === target);
    body.append(
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
      el("div", { class: "label" }, ["Note for"]),
      el("div", { class: "chips", role: "group", "aria-label": "Note for which list" }, [
        chip("All types", target === "all", () => setNoteTarget("all"), "One line per type, for lists that mix types"),
        ...allTypes.map((t) =>
          chip(`${t.emoji} ${t.listName}`, target === t.id, () => setNoteTarget(t.id), `For your "${t.listName}" list in Google Maps`),
        ),
      ]),
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
  });
  // Google Maps changes the URL without reloading the page.
  setInterval(() => {
    if (location.href !== state.href) onUrlChange();
  }, 400);
  // Ratings may have changed in the app while this tab was in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.ref) load();
  });
  onUrlChange();
  render();
}

// ---- helpers ----------------------------------------------------------------

type Child = Node | string | null | undefined;

function el(tag: string, attrs: Record<string, string> = {}, children: Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c != null) node.append(c);
  return node;
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

function isEditable(el: Element): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) return ["text", "search", ""].includes(el.type) && !el.disabled && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable;
}

function isSearchBox(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && (el.name === "q" || el.id === "searchboxinput" || el.getAttribute("role") === "combobox");
}

// The field to fill: the focused one, or the last one focused if the click
// on the panel took focus away anyway.
function pickTarget(host: HTMLElement, lastEditable: HTMLElement | null): HTMLElement | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active && active !== host && !host.contains(active) && isEditable(active)) return active;
  if (lastEditable?.isConnected) return lastEditable;
  return null;
}

function readValue(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText;
}

// Types the text into the field the way a paste would, so the page's own
// code sees a normal edit and its Done/Save button picks it up.
function writeValue(el: HTMLElement, text: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.select();
    const ok = document.execCommand("insertText", false, text);
    if (!ok || el.value !== text) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  if (!document.execCommand("insertText", false, text)) {
    el.innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}
