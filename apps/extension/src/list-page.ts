// Reads and drives a saved list that is open in Google Maps, so the note of
// every place in it can be updated in one go (see bulk.ts).
//
// Google's page is not a stable interface. Its class names are generated and
// change without notice, so nothing here uses them. This file goes by what
// the page tells a screen reader and shows a person:
//
// - the side panel is role="main", and its heading is the list's name
// - each place in the list is a button showing its name and details on
//   several lines, usually with a photo
// - the place's note comes after that button: a text box, or a button whose
//   label starts with "note" ("Add note", "Edit note") that opens one
// - a note is saved with a button labelled "Done" (or "Save")
//
// The button labels are Google's English ones. Every assumption about
// Google's list page is in this file, so a change on Google's side has one
// place to fix. describePage() copies what this file sees, for a bug report.

import {
  LIKELY_MIN_SIMILARITY,
  mergeNote,
  nameSimilarity,
  parseGoogleMapsUrl,
  sameName,
  type GooglePlaceRef,
} from "@repo/core";
import { deepActiveElement, isSearchBox, readValue, writeValue } from "./fields";

export type ListPanel = { root: HTMLElement; title: string };

export type ListItem = {
  name: string;
  card: HTMLElement; // the place's button in the list
  controls: HTMLElement[]; // its note box, or the button that opens one
  next: HTMLElement | null; // the next place's button: this place's part of the list ends there
  href: string | null; // a link to the place, if the list has one
};

const CLICKABLE = 'button, [role="button"], a[href]';
const TEXT_BOX = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
const NOTE_LABEL = /^((add|edit)( (a|your))? )?notes?\b/i;
const DONE_LABEL = /^(done|save)$/i;
const CANCEL_LABEL = /^cancel$/i;
const BACK_LABEL = /^back$/i;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Checks `test` until it gives something, or gives up after `ms`.
export async function waitFor<T>(test: () => T | null | undefined | false, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const value = test();
    if (value) return value;
    if (Date.now() >= end) return null;
    await sleep(150);
  }
}

// ---- finding the list --------------------------------------------------------

// The list open in the side panel, if there is one: the panel with the most
// note boxes. A place's own panel is never a list.
export function findListPanel(): ListPanel | null {
  const openPlace = parseGoogleMapsUrl(location.href)?.name;
  let best: ListPanel | null = null;
  let bestCount = 0;
  for (const root of document.querySelectorAll<HTMLElement>('[role="main"]')) {
    if (!visible(root)) continue;
    const title = panelTitle(root);
    if (openPlace && sameName(title, openPlace)) continue;
    const count = noteControls(root).length;
    if (count > bestCount) {
      best = { root, title };
      bestCount = count;
    }
  }
  return best;
}

// The same list again, in case Google drew it anew or hid it.
export function refreshPanel(panel: ListPanel): ListPanel | null {
  if (visible(panel.root) && panelTitle(panel.root) === panel.title && noteControls(panel.root).length > 0) return panel;
  const fresh = findListPanel();
  return fresh && (!panel.title || sameName(fresh.title, panel.title)) ? fresh : null;
}

// A guess from the address alone, used only to explain why nothing was found.
export function looksLikeListUrl(href: string): boolean {
  return /\/maps\/placelists\/|!11m\d/.test(href);
}

function panelTitle(root: HTMLElement): string {
  const heading = root.querySelector<HTMLElement>('h1, [role="heading"][aria-level="1"]');
  return (heading && lines(heading)[0]) || root.getAttribute("aria-label")?.trim() || "";
}

// ---- the places in the list --------------------------------------------------

// The places in the list as it is drawn now, top to bottom. Each note box
// belongs to the place button that comes before it on the page.
export function listItems(panel: ListPanel): ListItem[] {
  const notes = noteControls(panel.root);
  if (notes.length === 0) return [];
  const tokens = [
    ...placeButtons(panel.root, panel.title, notes).map((el) => ({ el, note: false })),
    ...notes.map((el) => ({ el, note: true })),
  ].sort((a, b) => (a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const items: ListItem[] = [];
  let pending: HTMLElement[] = [];
  for (const { el, note } of tokens) {
    if (!note) {
      pending.push(el);
      continue;
    }
    if (pending.length > 0) {
      const card = pickCard(pending);
      const name = placeName(card);
      if (name) items.push({ name, card, controls: [el], next: null, href: placeHref(card) });
      pending = [];
    } else {
      items.at(-1)?.controls.push(el);
    }
  }
  items.forEach((item, i) => (item.next = items[i + 1]?.card ?? null));
  return items;
}

// The place called `name`, nearest to where it was in the list.
export function findItem(panel: ListPanel, name: string, index: number): ListItem | null {
  const found = listItems(panel)
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => sameName(item.name, name))
    .sort((a, b) => Math.abs(a.i - index) - Math.abs(b.i - index));
  return found[0]?.item ?? null;
}

// Google adds places to a long list as you scroll it. This scrolls to the
// end until no more appear.
export async function loadWholeList(panel: ListPanel, stop: () => boolean): Promise<ListItem[]> {
  let items = listItems(panel);
  for (let tries = 0, unchanged = 0; tries < 100 && unchanged < 3 && !stop(); tries++) {
    const box = items.length > 0 ? scroller(items[items.length - 1].card) : null;
    if (!box) break;
    box.scrollTop = box.scrollHeight;
    await sleep(700);
    const now = listItems(panel);
    unchanged = now.length > items.length ? 0 : unchanged + 1;
    items = now;
  }
  return items;
}

function noteControls(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(`${TEXT_BOX}, ${CLICKABLE}`)) {
    if (found.at(-1)?.contains(el)) continue;
    const ok = el.matches(TEXT_BOX) ? el.checkVisibility() : NOTE_LABEL.test(labelOf(el)) && visible(el);
    if (ok) found.push(el);
  }
  return found;
}

// Buttons that could be a place: text on two or more lines, or a photo or
// heading. The outermost one counts when they are nested.
function placeButtons(root: HTMLElement, title: string, notes: HTMLElement[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (found.at(-1)?.contains(el) || notes.includes(el) || !visible(el)) continue;
    const text = lines(el);
    if (text.length === 0 || NOTE_LABEL.test(text[0])) continue;
    if (text.length < 2 && !el.querySelector(`img, ${HEADING}`)) continue;
    if (title && sameName(text[0], title)) continue; // the list's own header
    found.push(el);
  }
  return found;
}

// Other buttons can sit between two notes, such as the list's header before
// the first place. The place shows the most lines (name, rating, kind of
// place); on a tie, the one closest to the note wins.
function pickCard(candidates: HTMLElement[]): HTMLElement {
  let best = candidates[0];
  let bestLines = lines(best).length;
  for (const el of candidates.slice(1)) {
    const n = lines(el).length;
    if (n >= bestLines) {
      best = el;
      bestLines = n;
    }
  }
  return best;
}

function placeName(card: HTMLElement): string {
  const heading = card.querySelector<HTMLElement>(HEADING);
  return (heading && lines(heading)[0]) || lines(card)[0] || card.getAttribute("aria-label")?.trim() || "";
}

function placeHref(card: HTMLElement): string | null {
  const selector = 'a[href*="/maps/place/"]';
  return (card.closest<HTMLAnchorElement>(selector) ?? card.querySelector<HTMLAnchorElement>(selector))?.href ?? null;
}

function scroller(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
  }
  return null;
}

// ---- opening a place -------------------------------------------------------

// Reads Google's id for a place in the list: from its link if it has one,
// else by opening the place and reading the address bar. "other place"
// means a different place opened, so the list was read wrong.
export async function readPlaceRef(item: ListItem): Promise<GooglePlaceRef | "other place" | null> {
  const fromLink = item.href ? parseGoogleMapsUrl(item.href) : null;
  if (fromLink?.fid) return fromLink;
  const isThis = (ref: GooglePlaceRef | null) =>
    !!ref && (sameName(ref.name, item.name) || nameSimilarity(ref.name, item.name) >= LIKELY_MIN_SIMILARITY);

  const before = parseGoogleMapsUrl(location.href);
  if (before?.fid && isThis(before)) return before;
  press(item.card);
  const opened = await waitFor(() => {
    const ref = parseGoogleMapsUrl(location.href);
    return ref?.fid && ref.fid !== before?.fid ? ref : null;
  }, 8000);
  if (!opened) return null;
  return isThis(opened) ? opened : "other place";
}

// After opening a place, gets back to the list. Google may show the list
// beside the place, or in its place with a Back button.
export async function backToList(panel: ListPanel): Promise<ListPanel | null> {
  const ready = () => refreshPanel(panel);
  const now = ready();
  if (now) return now;
  const back = [...document.querySelectorAll<HTMLElement>(CLICKABLE)].find((el) => BACK_LABEL.test(labelOf(el)) && visible(el));
  if (back) {
    press(back);
    const found = await waitFor(ready, 4000);
    if (found) return found;
  }
  history.back();
  return waitFor(ready, 8000);
}

// ---- writing a note --------------------------------------------------------

export type NoteOutcome = "updated" | "unchanged" | { problem: string };

// Puts `block` at the top of the place's note, keeping the person's own text
// below it, and presses Done.
export async function updateNote(panel: ListPanel, item: ListItem, index: number, block: string): Promise<NoteOutcome> {
  if (noteHas(panel, item, block)) return "unchanged";
  const field = await openNote(panel, item);
  if (!field) return { problem: "couldn't open its note" };

  const existing = readValue(field);
  const text = mergeNote(existing, block);
  if (text === existing) {
    await closeNote(field);
    return "unchanged";
  }
  writeValue(field, text);
  const done = await waitFor(() => buttonNear(field, DONE_LABEL), 2000);
  if (!done) {
    field.blur();
    return { problem: "filled its note, but found no Done button. Check that it saved." };
  }
  press(done);
  const saved = await waitFor(() => {
    if (field.isConnected && deepActiveElement() === field) return false; // still editing
    const now = refreshPanel(panel);
    const fresh = now && findItem(now, item.name, index);
    return !!now && !!fresh && noteHas(now, fresh, block);
  }, 5000);
  return saved ? "updated" : { problem: "pressed Done, but the note on the page didn't change. Check that it saved." };
}

async function openNote(panel: ListPanel, item: ListItem): Promise<HTMLElement | null> {
  const box = item.controls.find((el) => el.matches(TEXT_BOX) && el.isConnected);
  if (box) {
    press(box);
    box.focus();
    return box;
  }
  press(item.controls[0]);
  return waitFor(() => openedEditor(panel, item), 3000);
}

// The text box that opened for this place: the focused one, or one that
// appeared in its part of the list or in a dialog.
function openedEditor(panel: ListPanel, item: ListItem): HTMLElement | null {
  const active = deepActiveElement();
  if (active instanceof HTMLElement && active.matches(TEXT_BOX) && !isSearchBox(active)) return active;
  const range = itemRange(panel, item);
  for (const el of document.querySelectorAll<HTMLElement>(TEXT_BOX)) {
    if (!el.checkVisibility()) continue;
    if (el.closest('[role="dialog"]') || range?.intersectsNode(el)) return el;
  }
  return null;
}

async function closeNote(field: HTMLElement) {
  const cancel = buttonNear(field, CANCEL_LABEL);
  if (cancel) press(cancel);
  else field.blur();
  await sleep(200);
}

// Whether the place's note on the page already holds `block`. Spaces and
// line breaks don't count, because the page may draw lines as separate
// elements.
function noteHas(panel: ListPanel, item: ListItem, block: string): boolean {
  const range = itemRange(panel, item);
  if (!range) return false;
  const want = block.replace(/\s+/g, "");
  const texts = [range.toString()];
  // A text box's value is not part of the page's text.
  for (const box of panel.root.querySelectorAll("textarea")) if (range.intersectsNode(box)) texts.push(box.value);
  return texts.some((t) => t.replace(/\s+/g, "").includes(want));
}

// The part of the list from this place's button up to the next place.
function itemRange(panel: ListPanel, item: ListItem): Range | null {
  if (!item.card.isConnected || !panel.root.contains(item.card)) return null;
  const range = document.createRange();
  range.setStartBefore(item.card);
  if (item.next?.isConnected && panel.root.contains(item.next)) range.setEndBefore(item.next);
  else range.setEnd(panel.root, panel.root.childNodes.length);
  return range;
}

// A visible button with this label, as close to the field as possible but
// in the same panel or dialog: a place open beside the list has a "Save"
// button of its own, for saving the place to a list.
function buttonNear(field: HTMLElement, label: RegExp): HTMLElement | null {
  const limit = field.closest('[role="dialog"], [role="main"]') ?? document.body;
  for (let el = field.parentElement; el; el = el.parentElement) {
    for (const b of el.querySelectorAll<HTMLElement>(CLICKABLE)) {
      if (label.test(labelOf(b)) && visible(b)) return b;
    }
    if (el === limit) break;
  }
  return null;
}

// ---- page helpers ----------------------------------------------------------

// A click as the page sees it. Google's code may listen for any of these.
function press(el: HTMLElement) {
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  const at: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", { ...at, pointerType: "mouse", isPrimary: true }));
  el.dispatchEvent(new MouseEvent("mousedown", at));
  el.dispatchEvent(new PointerEvent("pointerup", { ...at, pointerType: "mouse", isPrimary: true }));
  el.dispatchEvent(new MouseEvent("mouseup", at));
  el.click();
}

function visible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.checkVisibility({ visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// What a screen reader would call it, without icon characters.
function labelOf(el: Element): string {
  const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || "";
  return label.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function lines(el: HTMLElement): string[] {
  return el.innerText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---- for bug reports -------------------------------------------------------

const KEEP_ATTRIBUTE = /^(role|aria-[\w-]+|placeholder|href|contenteditable|type|tabindex|jsaction|data-[\w-]+)$/;

// What this file sees on the page, to paste into a bug report when it can't
// find the list or its notes. Class names, styles, images and scripts are
// left out.
export function describePage(): string {
  const panels = [...document.querySelectorAll<HTMLElement>('[role="main"]')];
  const out = [`URL: ${location.href}`, `Side panels (role="main"): ${panels.length}`];
  for (const [i, root] of panels.entries()) {
    const title = panelTitle(root);
    const items = listItems({ root, title });
    out.push(
      `${i + 1}. "${title}", ${visible(root) ? "visible" : "hidden"}, ${noteControls(root).length} note boxes, ` +
        `${items.length} places: ${items.slice(0, 5).map((it) => it.name).join(" | ")}`,
    );
  }
  const root = findListPanel()?.root ?? panels.find(visible);
  if (root) out.push("", "Panel HTML:", cleanHtml(root));
  return out.join("\n");
}

function cleanHtml(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("script, style").forEach((el) => el.remove());
  copy.querySelectorAll("svg").forEach((el) => el.replaceChildren());
  for (const el of [copy, ...copy.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) if (!KEEP_ATTRIBUTE.test(attr.name)) el.removeAttribute(attr.name);
  }
  const html = copy.outerHTML.replace(/<!---->/g, "");
  return html.length > 80_000 ? `${html.slice(0, 80_000)}\n… (cut)` : html;
}
