import { send } from "./messages";

const appUrl = document.getElementById("appUrl") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const save = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const shortcut = document.getElementById("shortcut") as HTMLSpanElement;

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
  if (config.token) await test();
})();
