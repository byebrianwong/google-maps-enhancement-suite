import { sameName, type ExtPlacesResponse } from "@repo/core";
import type { ListSummary } from "./bulk";
import { DEFAULT_CONFIG, type ApiResult, type Config, type ListTurn, type Request, type SavedList } from "./messages";

const LISTS_KEY = "lists"; // in chrome.storage.local: SavedList by type id
const RUN_KEY = "listRun"; // in chrome.storage.session: the "Update all lists" run going on

// "Update all lists" opens each saved list in turn in one tab. It is kept in
// session storage because Chrome stops this worker when it is idle.
type ListRun = { tabId: number; lists: SavedList[]; index: number; summaries: ListSummary[] };

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

async function savedLists(): Promise<Record<string, SavedList>> {
  return ((await chrome.storage.local.get(LISTS_KEY))[LISTS_KEY] as Record<string, SavedList> | undefined) ?? {};
}

async function getRun(): Promise<ListRun | null> {
  return ((await chrome.storage.session.get(RUN_KEY))[RUN_KEY] as ListRun | undefined) ?? null;
}

async function updateAllLists(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api<ExtPlacesResponse>("/api/ext/places");
  if (!res.ok) return { ok: false, error: res.error };
  // Leave out lists whose type was deleted or given another list name.
  const lists = Object.values(await savedLists())
    .filter((l) => res.data.types.some((t) => t.id === l.typeId && sameName(t.listName, l.title)))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (lists.length === 0) {
    return { ok: false, error: "No lists yet. Open each of your lists in Google Maps once, and the extension remembers it." };
  }
  // The run is stored before the tab loads the list, so the tab finds it.
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  if (tab.id == null) return { ok: false, error: "Couldn't open a tab." };
  const run: ListRun = { tabId: tab.id, lists, index: 0, summaries: [] };
  await chrome.storage.session.set({ [RUN_KEY]: run });
  await chrome.tabs.update(tab.id, { url: lists[0].url });
  return { ok: true };
}

async function listDone(tabId: number | undefined, summary: ListSummary) {
  const run = await getRun();
  if (!run || run.tabId !== tabId) return;
  run.summaries.push(summary);
  run.index++;
  if (summary.stopped || run.index >= run.lists.length) {
    await chrome.storage.session.remove(RUN_KEY);
    chrome.tabs.sendMessage(run.tabId, { type: "allListsDone", summaries: run.summaries }).catch(() => {});
    return;
  }
  await chrome.storage.session.set({ [RUN_KEY]: run });
  await chrome.tabs.update(run.tabId, { url: run.lists[run.index].url });
}

async function handle(req: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
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
    case "rememberList": {
      const lists = await savedLists();
      lists[req.list.typeId] = req.list;
      await chrome.storage.local.set({ [LISTS_KEY]: lists });
      return null;
    }
    case "getLists":
      return Object.values(await savedLists()).sort((a, b) => a.title.localeCompare(b.title));
    case "updateAllLists":
      return updateAllLists();
    case "tabReady": {
      const run = await getRun();
      if (!run || run.tabId !== sender.tab?.id) return null;
      const turn: ListTurn = { list: run.lists[run.index], position: run.index + 1, count: run.lists.length };
      return turn;
    }
    case "listDone":
      await listDone(sender.tab?.id, req.summary);
      return null;
  }
}

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  handle(req, sender).then(sendResponse, (err: Error) => sendResponse({ ok: false, status: 0, error: err.message }));
  return true; // the answer comes later
});

// The keyboard shortcut. Chrome delivers it here, so pass it to the page.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-note") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: "fill-note" }).catch(() => {});
});

// Closing the tab ends "Update all lists".
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if ((await getRun())?.tabId === tabId) await chrome.storage.session.remove(RUN_KEY);
});
