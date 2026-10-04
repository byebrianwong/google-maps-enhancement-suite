"use client";

import { Crosshair, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Origin } from "@/db/schema";
import { createPlaceAndOpen } from "@/lib/actions";
import type { LatLng } from "@repo/core";
import { useGeolocation } from "@/lib/hooks";
import type { TypeWithCriteria } from "@/lib/queries";
import type { NearbyPark } from "@/lib/search/overpass";
import type { SearchResult } from "@/lib/search/photon";
import { MapViewLazy } from "./MapViewLazy";

type Candidate = {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  source: "manual" | "photon" | "overpass";
  osmId?: string | null;
};

const KIND_EMOJI: Record<string, string> = { dog_park: "🐕", playground: "🛝", garden: "🌷", park: "🌳" };

export function AddPlace({ types, origins }: { types: TypeWithCriteria[]; origins: Origin[] }) {
  const home = origins.find((o) => o.isDefault) ?? origins[0];
  const geo = useGeolocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [name, setName] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>(types.map((t) => t.id));
  const [discovered, setDiscovered] = useState<NearbyPark[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverN, setDiscoverN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initialCenter: LatLng = home ? { lat: home.lat, lng: home.lng } : { lat: 37.7749, lng: -122.4194 };
  const center = useRef<LatLng>(initialCenter);
  const [centerState, setCenterState] = useState<LatLng>(initialCenter);

  // Debounced search as you type.
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const near = center.current;
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&lat=${near.lat}&lng=${near.lng}`, { signal: ac.signal });
        const json = (await res.json()) as { results: SearchResult[] };
        setResults(json.results ?? []);
      } catch {
        /* aborted or failed; keep old results */
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  // "Use my location" moves the map to you.
  function locateMe() {
    geo.request().then((p) => {
      if (!p) return;
      center.current = p;
      setCenterState(p);
      setDiscoverN((n) => n + 1);
    });
  }

  function pick(c: Candidate) {
    setCandidate(c);
    setName(c.name);
    setResults([]);
    setQuery("");
    setError(null);
  }

  async function discover() {
    setDiscovering(true);
    setError(null);
    try {
      const c = center.current;
      const res = await fetch(`/api/discover?lat=${c.lat}&lng=${c.lng}&radius=2500`);
      const json = (await res.json()) as { parks: NearbyPark[]; error?: string };
      if (json.error) throw new Error(json.error);
      setDiscovered(json.parks);
      setDiscoverN((n) => n + 1);
      if (json.parks.length === 0) setError("No named parks found within 2.5 km of the map center.");
    } catch (err) {
      setError(`Discover failed: ${(err as Error).message}`);
    } finally {
      setDiscovering(false);
    }
  }

  function save() {
    if (!candidate) return;
    if (!name.trim()) return setError("Give the place a name.");
    if (typeIds.length === 0) return setError("Pick at least one type.");
    startTransition(async () => {
      try {
        await createPlaceAndOpen({
          name: name.trim(),
          lat: candidate.lat,
          lng: candidate.lng,
          address: candidate.address ?? null,
          typeIds,
          source: candidate.source,
          osmId: candidate.osmId ?? null,
        });
      } catch (err) {
        // redirect() throws a control-flow error that Next handles; anything else is real.
        if ((err as Error)?.message?.includes("NEXT_REDIRECT")) throw err;
        setError((err as Error).message);
      }
    });
  }

  const markers = discovered
    .filter((d) => !candidate || d.osmId !== candidate.osmId)
    .map((d) => ({ id: d.osmId, lat: d.lat, lng: d.lng, label: d.name, emoji: KIND_EMOJI[d.kind] ?? "🌳", candidate: true }));

  return (
    <div className="flex-1 md:flex-none flex flex-col md:flex-row md:h-[calc(100dvh-3.5rem)]">
      <section className="md:w-[440px] md:shrink-0 md:overflow-y-auto md:border-r border-line order-2 md:order-1">
        <div className="p-4 space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Add a place</h1>

          <div className="relative">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                className="input !pl-9"
                placeholder="Search parks, addresses…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            {(results.length > 0 || searching) && query.length >= 2 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 card overflow-hidden shadow-lg max-h-72 overflow-y-auto">
                {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">Searching…</li>}
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-surface-2"
                      onClick={() => pick({ name: r.name, lat: r.lat, lng: r.lng, address: r.detail || null, source: "photon", osmId: r.osmId })}
                    >
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-xs text-ink-3">{[r.detail, r.kind.replace(":", " · ")].filter(Boolean).join(" — ")}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={discover} disabled={discovering}>
              <Sparkles size={15} className={discovering ? "animate-pulse-soft" : ""} />
              {discovering ? "Looking…" : "Find parks near map center"}
            </button>
            <button type="button" className="btn" onClick={locateMe} disabled={geo.loading} title="Move the map to my location">
              <Crosshair size={15} />
            </button>
          </div>
          <p className="text-xs text-ink-3">Or tap anywhere on the map to drop a pin. Drag the pin to fine-tune.</p>

          {discovered.length > 0 && !candidate && (
            <div className="card p-3">
              <div className="label">Found nearby</div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-line -mx-1">
                {discovered.map((d) => (
                  <li key={d.osmId}>
                    <button
                      type="button"
                      className="w-full text-left px-1 py-2 text-sm hover:bg-surface-2 flex items-center gap-2"
                      onClick={() => pick({ name: d.name, lat: d.lat, lng: d.lng, source: "overpass", osmId: d.osmId })}
                    >
                      <span>{KIND_EMOJI[d.kind] ?? "🌳"}</span>
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-xs text-ink-3">{d.kind.replace("_", " ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {candidate && (
            <div className="card p-4 space-y-3">
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                {candidate.address && <p className="text-xs text-ink-3 mt-1">{candidate.address}</p>}
                <p className="text-xs text-ink-3 mt-1 tabular-nums">{candidate.lat.toFixed(5)}, {candidate.lng.toFixed(5)}</p>
              </div>
              <div>
                <div className="label">Good for</div>
                <div className="flex flex-wrap gap-2">
                  {types.map((t) => {
                    const on = typeIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="chip"
                        data-active={on}
                        onClick={() => setTypeIds(on ? typeIds.filter((x) => x !== t.id) : [...typeIds, t.id])}
                      >
                        {t.emoji} {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary flex-1" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save place"}
                </button>
                <button type="button" className="btn" onClick={() => setCandidate(null)} disabled={pending}>Cancel</button>
              </div>
            </div>
          )}
          {!candidate && error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      <section className="h-[46vh] md:h-auto md:flex-1 order-1 md:order-2">
        <MapViewLazy
          className="w-full h-full"
          center={centerState}
          zoom={13}
          markers={markers}
          fitKey={candidate ? `c:${candidate.lat},${candidate.lng}` : `d:${discoverN}`}
          onMoveEnd={(c) => {
            center.current = c;
          }}
          onMapClick={(p) =>
            pick({ name: candidate?.source === "manual" ? name : "", lat: p.lat, lng: p.lng, source: "manual" })
          }
          onMarkerClick={(id) => {
            const d = discovered.find((x) => x.osmId === id);
            if (d) pick({ name: d.name, lat: d.lat, lng: d.lng, source: "overpass", osmId: d.osmId });
          }}
          draggable={candidate ? { lat: candidate.lat, lng: candidate.lng, onDragEnd: (p) => setCandidate({ ...candidate, lat: p.lat, lng: p.lng }) } : null}
        />
      </section>
    </div>
  );
}
