import type {
  ExtCreateRequest,
  ExtLinkRequest,
  ExtPlaceResponse,
  ExtPlacesResponse,
} from "@repo/core";

// Messages from the content script and popup to the background worker.
// The background worker makes every request to the web app, because a
// content script's requests are treated as coming from google.com.

export type Config = { appUrl: string; token: string };

export const DEFAULT_CONFIG: Config = { appUrl: "http://localhost:3000", token: "" };

export type Request =
  | { type: "getConfig" }
  | { type: "setConfig"; config: Config }
  | { type: "getPlaces" }
  | { type: "link"; body: ExtLinkRequest }
  | { type: "create"; body: ExtCreateRequest }
  | { type: "openOptions" };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export type ResponseFor<R extends Request> = R extends { type: "getConfig" }
  ? Config
  : R extends { type: "setConfig" }
    ? Config
    : R extends { type: "getPlaces" }
      ? ApiResult<ExtPlacesResponse>
      : R extends { type: "link" | "create" }
        ? ApiResult<ExtPlaceResponse>
        : null;

export function send<R extends Request>(req: R): Promise<ResponseFor<R>> {
  return chrome.runtime.sendMessage(req) as Promise<ResponseFor<R>>;
}

// Sent from the background worker to the content script.
export type TabMessage = { type: "fill-note" };
