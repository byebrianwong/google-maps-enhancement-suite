"use client";

import { Crosshair, ExternalLink, Navigation, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Origin } from "@/db/schema";
import { logVisit } from "@/lib/actions";
import { useGeolocation, useLocalState, useTravelTimes } from "@/lib/hooks";
import type { PlaceSummary, Settings, TypeWithCriteria } from "@/lib/queries";
import { SORT_OPTIONS, TRAVEL_MODES, scoreColor, timeAtPlace, type SortKey, type TravelMode } from "@repo/core";
import { formatMinutes, relativeDay, secondsToMinutes } from "@/lib/time";
import { MapViewLazy } from "./MapViewLazy";
import { ScoreBadge, Segmented, Toast, TypeChips, directionsUrl } from "./ui";

type Props = {
  places: PlaceSummary[];
  types: TypeWithCriteria[];
  origins: Origin[];
  settings: Settings;
};

const QUICK = [30, 45, 60, 90, 120];

export function GoNow({ places, types, origins, settings }: Props) {
  const defaultOrigin = origins.find((o) => o.isDefault) ?? origins[0];
  const [typeId, setTypeId] = useLocalState<string>("go.type", types[0]?.id ?? "");
  const [originKey, setOriginKey] = useLocalState<string>("go.origin", defaultOrigin ? `o:${defaultOrigin.id}` : "current");
  const [mode, setMode] = useLocalState<TravelMode>("go.mode", settings.defaultMode);
  const [budget, setBudget] = useLocalState<number>("go.budget", settings.defaultBudgetMinutes);
  const [sort, setSort] = useLocalState<SortKey>("go.sort", "best");
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const geo = useGeolocation();

  // If the stored type no longer exists, fall back to the first one.
  const type = types.find((t) => t.id === typeId) ?? types[0];
  useEffect(() => {
    if (type && type.id !== typeId) setTypeId(type.id);
  }, [type, typeId, setTypeId]);

  const originObj = originKey.startsWith("o:") ? origins.find((o) => o.id === originKey.slice(2)) : undefined;
  const useCurrent = originKey === "current" || (!originObj && !defaultOrigin);
  useEffect(() => {
    if (useCurrent && !geo.position && !geo.loading && !geo.error) geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCurrent]);
  const origin = useCurrent ? geo.position : originObj ? { lat: originObj.lat, lng: originObj.lng } : null;

  const candidates = useMemo(() => (type ? places.filter((p) => p.typeIds.includes(type.id)) : []), [places, type]);
  const travel = useTravelTimes({
    originId: useCurrent ? undefined : originObj?.id,
    origin,
    mode,
    placeIds: candidates.map((p) => p.id),
    enabled: !!origin,
  });

  const rows = useMemo(() => {
    const now = new Date();
    return candidates
      .map((p) => {
        const t = travel.times[p.id];
        const oneWay = t ? secondsToMinutes(t.seconds) : null;
        const atPlace = oneWay == null ? null : timeAtPlace(budget, oneWay);
        const fits = atPlace != null && atPlace >= settings.minStayMinutes;
        const score = type ? p.scores[type.id]?.score ?? null : null;
        const days = p.lastVisitAt ? (now.getTime() - p.lastVisitAt) / 86400000 : Infinity;
        return { p, t, oneWay, atPlace, fits, score, days };
      })
      .sort((a, b) => {
        if (a.fits !== b.fits) return a.fits ? -1 : 1;
        if (a.oneWay == null && b.oneWay != null) return 1;
        if (b.oneWay == null && a.oneWay != null) return -1;
        if (sort === "mostTime") return (b.atPlace ?? -1e9) - (a.atPlace ?? -1e9);
        if (sort === "leastRecent") return b.days - a.days;
        const sa = a.score ?? -1;
        const sb = b.score ?? -1;
        if (sb !== sa) return sb - sa;
        return (b.atPlace ?? -1e9) - (a.atPlace ?? -1e9);
      });
  }, [candidates, travel.times, budget, settings.minStayMinutes, type, sort]);

  const fitCount = rows.filter((r) => r.fits).length;

  const markers = rows.map((r) => ({
    id: r.p.id,
    lat: r.p.lat,
    lng: r.p.lng,
    label: r.score == null ? r.p.name.split(" ")[0] : r.score.toFixed(1),
    emoji: type?.emoji,
    color: scoreColor(r.score),
    dim: !r.fits,
    selected: selected === r.p.id,
  }));

  function go(row: (typeof rows)[number]) {
    startTransition(async () => {
      await logVisit({ placeId: row.p.id, typeId: type?.id ?? null });
      setToast(`Logged a visit to ${row.p.name}`);
      setTimeout(() => setToast(null), 2500);
    });
    window.open(directionsUrl(row.p.lat, row.p.lng, mode), "_blank", "noopener");
  }

  if (types.length === 0) {
    return <Empty title="No place types yet" body="Add a place type in Settings to get started." href="/settings" cta="Open settings" />;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row md:h-[calc(100dvh-3.5rem)]">
      {/* Controls + results */}
      <section className="md:w-[440px] md:shrink-0 md:overflow-y-auto md:border-r border-line bg-bg order-2 md:order-1">
        <div className="p-4 space-y-4">
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold tracking-tight">Where to right now?</h1>
          </div>

          <TypeChips types={types} value={type?.id ?? ""} onChange={setTypeId} />

          <div className="card p-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <div>
                <div className="label">I have about</div>
                <div className="text-3xl font-bold tabular-nums leading-none whitespace-nowrap">{formatMinutes(budget)}</div>
              </div>
              <div className="flex gap-1">
                {QUICK.map((m) => (
                  <button key={m} type="button" className="chip !px-2.5 !py-1 !text-xs" data-active={budget === m} onClick={() => setBudget(m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              min={15}
              max={240}
              step={5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Time available in minutes"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input !w-auto !py-1.5 text-sm font-semibold"
                value={originKey}
                onChange={(e) => setOriginKey(e.target.value)}
                aria-label="Starting point"
              >
                {origins.map((o) => (
                  <option key={o.id} value={`o:${o.id}`}>
                    {o.emoji} From {o.name}
                  </option>
                ))}
                <option value="current">📍 From my location</option>
              </select>
              <Segmented options={TRAVEL_MODES} value={mode} onChange={setMode} compact />
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto"
                onClick={() => travel.refresh()}
                disabled={travel.loading || !origin}
                title="Recompute travel times"
              >
                <RefreshCw size={14} className={travel.loading ? "animate-spin" : ""} />
              </button>
            </div>
            {useCurrent && geo.error && (
              <p className="text-xs text-danger flex items-center gap-1">
                <Crosshair size={12} /> {geo.error}
                <button className="underline ml-1" onClick={geo.request}>Try again</button>
              </p>
            )}
            {useCurrent && geo.loading && <p className="text-xs text-ink-3">Finding your location…</p>}
            {!useCurrent && !origin && (
              <p className="text-xs text-ink-3">
                No starting point saved. <Link className="underline" href="/settings">Add Home in Settings</Link> or use your location.
              </p>
            )}
            {travel.error && <p className="text-xs text-danger">{travel.error}</p>}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-2">
              {candidates.length === 0 ? (
                <>No {type?.name.toLowerCase()}s yet.</>
              ) : travel.loading && Object.keys(travel.times).length === 0 ? (
                <span className="animate-pulse-soft">Checking travel times…</span>
              ) : (
                <>
                  <b>{fitCount}</b> of {candidates.length} fit in {formatMinutes(budget)}
                </>
              )}
            </p>
            <select className="input !w-auto !py-1 !text-xs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {candidates.length === 0 && (
            <Empty title={`Add your first ${type?.name.toLowerCase()}`} body="Search for a park or discover parks near you." href="/places/new" cta="Add a place" />
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.p.id}>
                <div
                  className={`card p-3 transition-shadow cursor-pointer ${selected === r.p.id ? "ring-2 ring-accent" : ""} ${r.fits ? "" : "opacity-60"}`}
                  onClick={() => setSelected(r.p.id)}
                >
                  <div className="flex items-start gap-3">
                    <ScoreBadge score={r.score} size="lg" title={r.score == null ? "Not rated yet" : `${type?.name} score`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{r.p.name}</div>
                      <div className="text-sm text-ink-2 mt-0.5">
                        {r.oneWay == null ? (
                          travel.loading ? <span className="animate-pulse-soft">Checking route…</span> : "No route found"
                        ) : (
                          <>
                            {TRAVEL_MODES.find((m) => m.id === mode)?.emoji} {formatMinutes(r.oneWay)} each way
                            {r.fits ? (
                              <> · <b className="text-ink">{formatMinutes(r.atPlace!)}</b> at the park</>
                            ) : (
                              <> · <span className="text-danger">needs {formatMinutes(2 * r.oneWay + settings.minStayMinutes)}</span></>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-ink-3 mt-1">
                        Last visit {relativeDay(r.p.lastVisitAt)}
                        {r.p.visitCount > 0 && <> · {r.p.visitCount} visit{r.p.visitCount === 1 ? "" : "s"}</>}
                        {r.t && !r.t.cached && r.t.provider === "estimate" && <> · estimated</>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" className="btn btn-primary btn-sm flex-1" onClick={(e) => { e.stopPropagation(); go(r); }}>
                      <Navigation size={14} /> Go
                    </button>
                    <Link href={`/places/${r.p.id}`} className="btn btn-sm" onClick={(e) => e.stopPropagation()}>
                      Details <ExternalLink size={13} />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {travel.provider && <p className="text-[11px] text-ink-3">Travel times: {travel.provider}. Return trip assumed equal to the trip out.</p>}
        </div>
      </section>

      {/* Map */}
      <section className="h-[40vh] md:h-auto md:flex-1 order-1 md:order-2">
        <MapViewLazy
          className="w-full h-full"
          markers={markers}
          origin={origin ? { ...origin, emoji: useCurrent ? "📍" : originObj?.emoji } : null}
          fitKey={`${type?.id}|${originKey}|${mode}|${fitCount}`}
          onMarkerClick={(id) => {
            setSelected(id);
            document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        />
      </section>
      <Toast message={toast} />
    </div>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="card p-6 text-center space-y-2">
      <div className="text-3xl">🌳</div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-ink-2">{body}</p>
      <Link href={href} className="btn btn-primary mt-2">{cta}</Link>
    </div>
  );
}
