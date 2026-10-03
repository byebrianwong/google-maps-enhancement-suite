import { DEFAULT_CONFIG, type ApiResult, type Config, type Request } from "./messages";

async function getConfig(): Promise<Config> {
  const stored = (await chrome.storage.local.get("config")).config as Partial<Config> | undefined;
  return { ...DEFAULT_CONFIG, ...stored };
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  const config = await getConfig();
  if (!config.token) {
    return { ok: false, status: 0, error: "No token yet. Click the extension icon and paste the token from the app's Settings page." };
  }
  let res: Response;
  try {
    res = await fetch(new URL(path, config.appUrl), {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, error: `Can't reach the app at ${config.appUrl}. Is it running?` };
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    return { ok: false, status: res.status, error: data?.error ?? `The app answered with HTTP ${res.status}.` };
  }
  return { ok: true, data };
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case "getConfig":
      return getConfig();
    case "setConfig": {
      const config: Config = { appUrl: req.config.appUrl.replace(/\/+$/, ""), token: req.config.token.trim() };
      await chrome.storage.local.set({ config });
      return config;
    }
    case "getPlaces":
      return api("/api/ext/places");
    case "link":
      return api("/api/ext/link", { method: "POST", body: req.body });
    case "create":
      return api("/api/ext/places", { method: "POST", body: req.body });
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return null;
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse, (err: Error) => sendResponse({ ok: false, status: 0, error: err.message }));
  return true; // the answer comes later
});

// The keyboard shortcut. Chrome delivers it here, so pass it to the page.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-note") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: "fill-note" }).catch(() => {});
});
