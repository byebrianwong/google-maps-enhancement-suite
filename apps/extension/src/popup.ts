import { send } from "./messages";

const appUrl = document.getElementById("appUrl") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const save = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const shortcut = document.getElementById("shortcut") as HTMLSpanElement;
const lists = document.getElementById("lists") as HTMLUListElement;
const listsHint = document.getElementById("listsHint") as HTMLParagraphElement;
const updateAll = document.getElementById("updateAll") as HTMLButtonElement;

function show(text: string, tone: "ok" | "warn") {
  status.textContent = text;
  status.className = tone;
}

async function test() {
  show("Testing…", "ok");
  const res = await send({ type: "getPlaces" });
  if (res.ok) {
    const total = res.data.places.length;
    const linked = res.data.places.filter((p) => p.googleFid).length;
    show(`Connected. ${total} ${total === 1 ? "place" : "places"}, ${linked} linked to Google Maps.`, "ok");
  } else {
    show(res.error, "warn");
  }
}

// Lists the extension has seen open in Google Maps. "Update all lists"
// opens each one in a new tab and updates every note in it.
async function showLists() {
  const saved = await send({ type: "getLists" });
  lists.replaceChildren(
    ...saved.map((l) => {
      const li = document.createElement("li");
      li.textContent = l.title;
      return li;
    }),
  );
  listsHint.textContent =
    saved.length > 0
      ? "Update all lists opens each of these in a new tab and updates every note in it."
      : "Open each of your lists in Google Maps once. Lists named like a type's Google Maps list (set in the app's type settings) show up here.";
  updateAll.disabled = saved.length === 0;
}

updateAll.addEventListener("click", async () => {
  updateAll.disabled = true;
  const res = await send({ type: "updateAllLists" });
  if (!res.ok) {
    show(res.error, "warn");
    updateAll.disabled = false;
  }
});

// Localhost is allowed in the manifest. Any other address needs the
// person's permission, which Chrome only asks for after a click.
async function ensurePermission(url: string): Promise<boolean> {
  const { hostname, origin } = new URL(url);
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

save.addEventListener("click", async () => {
  let url: string;
  try {
    url = new URL(appUrl.value.trim() || "http://localhost:3000").toString();
  } catch {
    show("That URL doesn't look right.", "warn");
    return;
  }
  save.disabled = true;
  try {
    if (!(await ensurePermission(url))) {
      show("Chrome needs permission to reach that address.", "warn");
      return;
    }
    const config = await send({ type: "setConfig", config: { appUrl: url, token: token.value } });
    appUrl.value = config.appUrl;
    await test();
  } finally {
    save.disabled = false;
  }
});

(async () => {
  const config = await send({ type: "getConfig" });
  appUrl.value = config.appUrl;
  token.value = config.token;
  const commands = await chrome.commands.getAll();
  const fill = commands.find((c) => c.name === "fill-note");
  shortcut.textContent = fill?.shortcut || "a shortcut you set at chrome://extensions/shortcuts";
  await showLists();
  if (config.token) await test();
})();
