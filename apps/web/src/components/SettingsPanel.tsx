"use client";

import { Check, ChevronRight, Copy, Crosshair, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import type { Origin } from "@/db/schema";
import {
  clearTravelCache,
  createOrigin,
  createPlaceType,
  deleteOrigin,
  resetExtensionToken,
  saveSettings,
  setDefaultOrigin,
  updateOrigin,
} from "@/lib/actions";
import type { LatLng } from "@repo/core";
import { useGeolocation } from "@/lib/hooks";
import type { Settings, TypeWithCriteria } from "@/lib/queries";
import { TRAVEL_MODES, type TravelMode } from "@repo/core";
import type { SearchResult } from "@/lib/search/photon";
import { MapViewLazy } from "./MapViewLazy";
import { Segmented } from "./ui";

type Props = {
  origins: Origin[];
  settings: Settings;
  types: TypeWithCriteria[];
  providerLabel: string;
  extensionToken: string;
};

export function SettingsPanel({ origins, settings, types, providerLabel, extensionToken }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="p-4 max-w-3xl mx-auto w-full space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <OriginsSection origins={origins} />

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Defaults</h2>
        <Defaults settings={settings} />
      </section>

      <section className="card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Place types</h2>
          <p className="text-sm text-ink-2 mt-0.5">
            Each type has its own list of things you rate and its own way of adding them up into one score. A type can
            match one of your Google Maps lists.
          </p>
        </div>
        <ul className="space-y-2">
          {types.map((t) => (
            <li key={t.id}>
              <TypeRow type={t} />
            </li>
          ))}
        </ul>
        <NewTypeForm />
      </section>

      <ExtensionSection token={extensionToken} />

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Travel times</h2>
        <p className="text-sm text-ink-2">Provider: {providerLabel}.</p>
        <p className="text-xs text-ink-3">
          Set <code>GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> (Routes API enabled) for traffic-aware times on all modes. Cached results expire after 7 days.
        </p>
        <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => clearTravelCache())}>Clear cached travel times</button>
      </section>
    </div>
  );
}

// ---- Origins ---------------------------------------------------------------

function OriginsSection({ origins }: { origins: Origin[] }) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(origins.length === 0);
  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Starting points</h2>
        {!adding && <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Add</button>}
      </div>
      {origins.length === 0 && !adding && <p className="text-sm text-ink-2">Add Home so travel times have somewhere to start from.</p>}
      <ul className="divide-y divide-line">
        {origins.map((o) => (
          <li key={o.id} className="py-2 flex items-center gap-3 text-sm">
            <button
              className={`btn btn-ghost btn-sm ${o.isDefault ? "text-warn" : "text-ink-3"}`}
              title={o.isDefault ? "Default" : "Make default"}
              disabled={pending}
              onClick={() => startTransition(() => setDefaultOrigin(o.id))}
            >
              <Star size={16} fill={o.isDefault ? "currentColor" : "none"} />
            </button>
            <span className="text-lg">{o.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-ink-3 tabular-nums">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</div>
            </div>
            <button
              className="btn btn-ghost btn-sm text-ink-3"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove ${o.name}?`)) startTransition(() => deleteOrigin(o.id));
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {adding && <OriginForm onDone={() => setAdding(false)} />}
    </section>
  );
}

function OriginForm({ onDone, existing }: { onDone: () => void; existing?: Origin }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(existing?.name ?? "Home");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "🏠");
  const [pos, setPos] = useState<LatLng | null>(existing ? { lat: existing.lat, lng: existing.lng } : null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const geo = useGeolocation();

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      if (query.trim().length < 3) {
        setResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ac.signal });
        const json = (await res.json()) as { results: SearchResult[] };
        setResults(json.results ?? []);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  function save() {
    if (!pos) return setError("Pick a location: search, use your location, or tap the map.");
    startTransition(async () => {
      if (existing) await updateOrigin(existing.id, { name, emoji, ...pos });
      else await createOrigin({ name, emoji, ...pos });
      onDone();
    });
  }

  return (
    <div className="rounded-xl bg-surface-2 p-3 space-y-3">
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <div>
          <label className="label" htmlFor="o-emoji">Icon</label>
          <input id="o-emoji" className="input text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="o-name">Name</label>
          <input id="o-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="relative">
        <label className="label" htmlFor="o-search">Location</label>
        <div className="flex gap-2">
          <input id="o-search" className="input" placeholder="Search an address…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" type="button" onClick={() => geo.request().then((p) => p && setPos(p))} disabled={geo.loading} title="Use my location"><Crosshair size={15} /></button>
        </div>
        {results.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 card overflow-hidden shadow-lg max-h-56 overflow-y-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm"
                  onClick={() => {
                    setPos({ lat: r.lat, lng: r.lng });
                    setResults([]);
                    setQuery("");
                  }}
                >
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-ink-3">{r.detail}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {geo.error && <p className="text-xs text-danger mt-1">{geo.error}</p>}
      </div>
      <div className="h-56 rounded-xl overflow-hidden border border-line">
        <MapViewLazy
          className="w-full h-full"
          center={pos ?? undefined}
          zoom={pos ? 14 : 11}
          fitKey={pos ? `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}` : "none"}
          onMapClick={(p) => setPos(p)}
          draggable={pos ? { ...pos, onDragEnd: setPos } : null}
        />
      </div>
      {pos && <p className="text-xs text-ink-3 tabular-nums">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        <button className="btn btn-sm" onClick={onDone} disabled={pending}>Cancel</button>
      </div>
    </div>
  );
}

// ---- Defaults --------------------------------------------------------------

function Defaults({ settings }: { settings: Settings }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<TravelMode>(settings.defaultMode);
  const [budget, setBudget] = useState(settings.defaultBudgetMinutes);
  const [minStay, setMinStay] = useState(settings.minStayMinutes);
  const dirty = mode !== settings.defaultMode || budget !== settings.defaultBudgetMinutes || minStay !== settings.minStayMinutes;
  return (
    <div className="space-y-3">
      <div>
        <div className="label">Default travel mode</div>
        <Segmented options={TRAVEL_MODES} value={mode} onChange={setMode} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="s-budget">Default time budget (min)</label>
          <input id="s-budget" type="number" className="input" min={15} max={480} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="s-stay">Minimum time at a place (min)</label>
          <input id="s-stay" type="number" className="input" min={5} max={240} value={minStay} onChange={(e) => setMinStay(Number(e.target.value))} />
          <p className="text-[11px] text-ink-3 mt-1">A place only &quot;fits&quot; if you would get at least this long there.</p>
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        disabled={!dirty || pending}
        onClick={() => startTransition(() => saveSettings({ defaultMode: mode, defaultBudgetMinutes: budget, minStayMinutes: minStay }))}
      >
        {pending ? "Saving…" : "Save defaults"}
      </button>
    </div>
  );
}

// ---- Types -----------------------------------------------------------------

function TypeRow({ type }: { type: TypeWithCriteria }) {
  const notCounted = type.criteria.filter((c) => !(c.weight > 0)).length;
  const details = [
    `${type.criteria.length} ${type.criteria.length === 1 ? "criterion" : "criteria"}`,
    notCounted > 0 ? `${notCounted} not counted` : null,
    `Google Maps list: ${type.googleListName || type.name}`,
  ].filter(Boolean);
  return (
    <Link href={`/settings/types/${type.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface-2">
      <span className="text-xl">{type.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{type.name}</span>
        <span className="block text-xs text-ink-3 truncate">{details.join(" · ")}</span>
      </span>
      <span className="text-xs font-semibold text-ink-2 hidden sm:inline">Edit</span>
      <ChevronRight size={16} className="text-ink-3" />
    </Link>
  );
}

function NewTypeForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏞️");
  const [color, setColor] = useState("#3182ce");
  return (
    <div className="rounded-xl bg-surface-2 p-3 flex flex-wrap items-end gap-2">
      <div className="w-16">
        <label className="label" htmlFor="t-emoji">Icon</label>
        <input id="t-emoji" className="input text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      </div>
      <div className="flex-1 min-w-40">
        <label className="label" htmlFor="t-name">New type</label>
        <input id="t-name" className="input" placeholder="e.g. Coffee walk, Picnic" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="t-color">Color</label>
        <input id="t-color" type="color" className="h-10 w-14 rounded-lg border border-line bg-surface" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <button
        className="btn btn-primary"
        disabled={pending || !name.trim()}
        onClick={() => startTransition(() => createPlaceType({ name, emoji, color }))}
      >
        <Plus size={14} /> Add type
      </button>
    </div>
  );
}

// ---- Chrome extension ------------------------------------------------------

function ExtensionSection({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  // Read on the client only, so the server render and the first client render match.
  const appUrl = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-semibold">Chrome extension</h2>
      <p className="text-sm text-ink-2">
        The Enhancement Suite for Google Maps extension shows these ratings on Google Maps and fills them into
        the notes on your Google Maps lists. Paste these two values into the extension&apos;s settings.
      </p>
      <div className="grid gap-2">
        <CopyRow label="App URL" value={appUrl} copied={copied === "url"} onCopy={() => copy("url", appUrl)} />
        <CopyRow label="Token" value={token} copied={copied === "token"} onCopy={() => copy("token", token)} mono />
      </div>
      <details className="text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">How to install it</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>In the project folder, run <code>npm run build:extension</code>.</li>
          <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>
          <li>Click &quot;Load unpacked&quot; and choose <code>apps/extension/dist</code>.</li>
          <li>Click the extension&apos;s icon, paste the URL and token, and press Save.</li>
        </ol>
      </details>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() => {
          if (confirm("Make a new token? The extension stops working until you paste the new one.")) {
            startTransition(() => resetExtensionToken());
          }
        }}
      >
        Make a new token
      </button>
    </section>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="label !mb-0 w-20 shrink-0">{label}</div>
      <code className={`flex-1 min-w-0 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
      <button className="btn btn-sm" onClick={onCopy} title={`Copy ${label}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
