// A stand-in for one of your saved lists in Google Maps, for the e2e test.
//
// The real list page only exists when signed in, so the test serves this
// page at a Google Maps address instead, and the extension runs on it as it
// would on the real one. It is built only from what list-page.ts relies on
// (a role="main" panel, place buttons, note boxes, Done buttons), with
// class names that mean nothing, like Google's. Two variants cover the two
// ways the real page might behave:
//
//   "inline": every note is a text box. Focusing it shows Cancel and Done.
//             Opening a place shows it beside the list.
//   "button": a note is shown as text with an "Edit note" button, or an
//             "Add note" button. Either opens a text box with Cancel and
//             Done. Opening a place replaces the list until you press Back.
//
// Saved notes are kept in localStorage under "fakeList:<id>", and every
// save is counted in "fakeListSaves:<id>", so the test can check them and
// they survive a reload.

export function fakeListPage({ id, title, variant, items }) {
  const config = JSON.stringify({ id, title, variant, items });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title} - Google Maps</title>
<style>
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
  .k1 { width: 408px; height: 100vh; overflow-y: auto; border-right: 1px solid #ddd; }
  .k2 { width: 360px; padding: 12px; border-right: 1px solid #ddd; }
  .k3 { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; background: none; border: 0; padding: 12px; cursor: pointer; }
  .k3 img { width: 64px; height: 64px; background: #9c9; border-radius: 8px; }
  .k4 { padding: 0 12px 12px 88px; }
  .k4 textarea { width: 100%; box-sizing: border-box; font: inherit; }
  .k5 { white-space: pre-wrap; }
  .k6 { height: 520px; } /* tall enough that the list scrolls, so later places load on scroll */
</style></head>
<body>
<div class="k1" id="scroller"><div role="main" aria-label="${title}" id="list"></div></div>
<script>
const config = ${config};
const NOTES = "fakeList:" + config.id;
const SAVES = "fakeListSaves:" + config.id;
const listUrl = location.href;
const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || fallback);
const notes = () => read(NOTES, "{}");
function noteOf(item) { const saved = notes(); return item.name in saved ? saved[item.name] : item.note || ""; }
function save(item, value) {
  localStorage.setItem(NOTES, JSON.stringify({ ...notes(), [item.name]: value }));
  localStorage.setItem(SAVES, JSON.stringify([...read(SAVES, "[]"), item.name]));
}
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) el.append(c);
  return el;
}

const list = document.getElementById("list");
const scroller = document.getElementById("scroller");
list.append(
  h("div", { class: "k6" }, [h("h1", {}, config.title), h("div", {}, "Private · " + config.items.length + " places"), h("button", {}, "Share")]),
);
const rows = h("div");
list.append(rows);

// Like Google, the list shows a few places and adds more as you scroll.
let shown = 0;
function showMore() {
  for (const item of config.items.slice(shown, shown + 3)) rows.append(...itemRows(item));
  shown = Math.min(shown + 3, config.items.length);
}
scroller.addEventListener("scroll", () => {
  if (shown < config.items.length && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 20) {
    setTimeout(showMore, 400);
  }
});

function card(item) {
  return h("button", { class: "k3", onclick: () => openPlace(item) }, [
    h("img", { alt: "", src: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" }),
    h("div", {}, [h("div", {}, item.name), h("div", {}, "4.6 ★ (1,234)"), h("div", {}, "Park")]),
  ]);
}

function itemRows(item) {
  if (config.variant === "inline") {
    const box = h("textarea", { "aria-label": "Note", placeholder: "Add note", rows: "2" });
    box.value = noteOf(item);
    const actions = h("div", { hidden: "" }, [
      h("button", { onclick: () => { box.value = noteOf(item); actions.hidden = true; box.blur(); } }, "Cancel"),
      h("button", { onclick: () => { save(item, box.value); actions.hidden = true; box.blur(); } }, "Done"),
    ]);
    box.addEventListener("focus", () => (actions.hidden = false));
    return [h("div", {}, [card(item), h("button", { "aria-label": "Remove from list" }, "✕")]), h("div", { class: "k4" }, [box, actions])];
  }
  const area = h("div", { class: "k4" });
  function showNote() {
    const note = noteOf(item);
    area.replaceChildren(
      ...(note
        ? [h("div", { class: "k5" }, note), h("button", { "aria-label": "Edit note", onclick: edit }, "✎")]
        : [h("button", { onclick: edit }, "Add note")]),
    );
  }
  function edit() {
    const box = h("textarea", { rows: "3" });
    box.value = noteOf(item);
    area.replaceChildren(
      box,
      h("button", { onclick: showNote }, "Cancel"),
      h("button", { onclick: () => { save(item, box.value); showNote(); } }, "Done"),
    );
    box.focus();
  }
  showNote();
  return [h("div", {}, [card(item), area])];
}

// Opening a place changes the address the way Google Maps does, without
// loading a new page.
let placePanel = null;
function openPlace(item) {
  history.pushState({}, "", item.url);
  placePanel?.remove();
  placePanel = h("div", { role: "main", "aria-label": item.name, class: "k2" }, [
    config.variant === "button" ? h("button", { "aria-label": "Back", onclick: () => history.back() }, "←") : null,
    h("h1", {}, item.name),
  ]);
  if (config.variant === "button") scroller.style.display = "none";
  document.body.append(placePanel);
}
addEventListener("popstate", () => {
  if (location.href !== listUrl) return;
  placePanel?.remove();
  placePanel = null;
  scroller.style.display = "";
});

showMore();
</script>
</body></html>`;
}
