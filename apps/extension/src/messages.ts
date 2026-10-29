import type {
  ExtCreateRequest,
  ExtLinkRequest,
  ExtPlaceResponse,
  ExtPlacesResponse,
} from "@repo/core";
import type { ListSummary } from "./bulk";

// Messages from the content script and popup to the background worker.
// The background worker makes every request to the web app, because a
// content script's requests are treated as coming from google.com.

export type Config = { appUrl: string; token: string };

export const DEFAULT_CONFIG: Config = { appUrl: "http://localhost:3000", token: "" };

// A Google Maps list the extension has seen open, kept so "Update all lists"
// can open it again. Only lists named like a type's list are kept.
export type SavedList = { typeId: string; title: string; url: string };

// Sent to a tab that "Update all lists" opened: the list to update there.
export type ListTurn = { list: SavedList; position: number; count: number };

export type Request =
  | { type: "getConfig" }
  | { type: "setConfig"; config: Config }
  | { type: "getPlaces" }
  | { type: "link"; body: ExtLinkRequest }
  | { type: "create"; body: ExtCreateRequest }
  | { type: "openOptions" }
  | { type: "rememberList"; list: SavedList }
  | { type: "getLists" }
  | { type: "updateAllLists" }
  | { type: "tabReady" }
  | { type: "listDone"; summary: ListSummary };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

type Responses = {
  getConfig: Config;
  setConfig: Config;
  getPlaces: ApiResult<ExtPlacesResponse>;
  link: ApiResult<ExtPlaceResponse>;
  create: ApiResult<ExtPlaceResponse>;
  openOptions: null;
  rememberList: null;
  getLists: SavedList[];
  updateAllLists: { ok: true } | { ok: false; error: string };
  tabReady: ListTurn | null;
  listDone: null;
};

export type ResponseFor<R extends Request> = Responses[R["type"]];

export function send<R extends Request>(req: R): Promise<ResponseFor<R>> {
  return chrome.runtime.sendMessage(req) as Promise<ResponseFor<R>>;
}

// Sent from the background worker to the content script.
export type TabMessage = { type: "fill-note" } | { type: "allListsDone"; summaries: ListSummary[] };
