"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LatLng } from "@repo/core";
import type { TravelInfo } from "./routing";
import type { TravelMode } from "@repo/core";

// ---- Geolocation -----------------------------------------------------------

export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resolves with the position, or null on failure (error state is set).
  const request = useCallback((): Promise<LatLng | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not available in this browser.");
      return Promise.resolve(null);
    }
    setLoading(true);
    setError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(p);
          setLoading(false);
          resolve(p);
        },
        (err) => {
          setError(err.message || "Could not get your location.");
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
      );
    });
  }, []);

  return { position, error, loading, request };
}

// ---- Travel times ----------------------------------------------------------

export type TravelMap = Record<string, TravelInfo | null>;

type TravelResult = { baseKey: string; key: string; times: TravelMap; provider: string; error: string | null };

// Fetches one-way travel times from an origin to a set of places. Refetches
// when the origin, mode or place set changes. refresh() bypasses the cache.
export function useTravelTimes(opts: {
  originId?: string;
  origin: LatLng | null;
  mode: TravelMode;
  placeIds: string[];
  enabled?: boolean;
}) {
  const enabled = (opts.enabled ?? true) && !!opts.origin && opts.placeIds.length > 0;
  const idsKey = opts.placeIds.slice().sort().join(",");
  const originKey = opts.originId ?? (opts.origin ? `${opts.origin.lat.toFixed(5)},${opts.origin.lng.toFixed(5)}` : "");
  const baseKey = `${originKey}|${opts.mode}|${idsKey}`;
  const [forceN, setForceN] = useState(0);
  const key = `${baseKey}|${forceN}`;
  const forceRef = useRef(false);
  const [result, setResult] = useState<TravelResult | null>(null);

  const origin = opts.origin;
  const originId = opts.originId;
  const mode = opts.mode;
  useEffect(() => {
    if (!enabled || !origin) return;
    const force = forceRef.current;
    forceRef.current = false;
    const ac = new AbortController();
    fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originId,
        origin: originId ? undefined : origin,
        mode,
        placeIds: idsKey ? idsKey.split(",") : [],
        force,
      }),
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Travel lookup failed (${res.status})`);
        const json = (await res.json()) as { times: TravelMap; provider: string };
        setResult({ baseKey, key, times: json.times, provider: json.provider, error: null });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setResult({ baseKey, key, times: {}, provider: "", error: err.message });
      });
    return () => ac.abort();
    // originId/origin/mode are folded into key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const fresh = result && result.key === key ? result : null;
  // Keep showing the previous numbers while a forced refresh is in flight.
  const stale = !fresh && result && result.baseKey === baseKey ? result : null;
  const shown = fresh ?? stale;

  return {
    times: enabled ? shown?.times ?? {} : {},
    provider: shown?.provider ?? "",
    loading: enabled && !fresh,
    error: fresh?.error ?? null,
    refresh: () => {
      forceRef.current = true;
      setForceN((n) => n + 1);
    },
  };
}

// ---- localStorage-backed state ---------------------------------------------
// Per-device preferences like the last chosen type or budget. Reads through
// useSyncExternalStore so the server render uses the default and the client
// switches to the stored value without a hydration mismatch.

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function read<T>(key: string, initial: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  if (raw == null) return initial;
  const c = cache.get(key);
  if (c && c.raw === raw) return c.value as T;
  try {
    const value = JSON.parse(raw) as T;
    cache.set(key, { raw, value });
    return value;
  } catch {
    return initial;
  }
}

export function useLocalState<T>(key: string, initial: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, initial),
    () => initial,
  );
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read(key, initial);
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      const raw = JSON.stringify(v);
      try {
        localStorage.setItem(key, raw);
      } catch {}
      cache.set(key, { raw, value: v });
      listeners.forEach((l) => l());
    },
    // initial is a primitive default; changing it should not re-create the setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set] as const;
}
