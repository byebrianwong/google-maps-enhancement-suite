"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocalState } from "@/lib/hooks";
import type { PlaceSummary, TypeWithCriteria } from "@/lib/queries";
import { scoreColor } from "@repo/core";
import { relativeDay } from "@/lib/time";
import { MapViewLazy } from "./MapViewLazy";
import { ScoreBadge, TypeChips } from "./ui";

export function PlacesList({ places, types }: { places: PlaceSummary[]; types: TypeWithCriteria[] }) {
  const [filter, setFilter] = useLocalState<string>("places.filter", "all");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = filter === "all" ? places : places.filter((p) => p.typeIds.includes(filter));
    return list
      .map((p) => {
        const s =
          filter === "all"
            ? Math.max(-1, ...Object.values(p.scores).map((x) => x?.score ?? -1))
            : p.scores[filter]?.score ?? -1;
        return { p, score: s < 0 ? null : s };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.p.name.localeCompare(b.p.name));
  }, [places, filter]);

  const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
  const markers = rows.map((r) => ({
    id: r.p.id,
    lat: r.p.lat,
    lng: r.p.lng,
    label: r.score == null ? r.p.name.split(" ")[0] : r.score.toFixed(1),
    emoji: filter === "all" ? r.p.typeIds.map((id) => typeById[id]?.emoji ?? "").join("") : typeById[filter]?.emoji,
    color: scoreColor(r.score),
    selected: selected === r.p.id,
  }));

  return (
    <div className="flex-1 flex flex-col md:flex-row md:h-[calc(100dvh-3.5rem)]">
      <section className="md:w-[440px] md:shrink-0 md:overflow-y-auto md:border-r border-line order-2 md:order-1">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Places</h1>
            <Link href="/places/new" className="btn btn-primary btn-sm"><Plus size={16} /> Add</Link>
          </div>
          <TypeChips types={types} value={filter} onChange={setFilter} allowAll />
          {rows.length === 0 && (
            <div className="card p-6 text-center space-y-2">
              <div className="text-3xl">🗺️</div>
              <p className="text-sm text-ink-2">Nothing here yet.</p>
              <Link href="/places/new" className="btn btn-primary">Add a place</Link>
            </div>
          )}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.p.id}>
                <Link
                  href={`/places/${r.p.id}`}
                  className={`card p-3 flex items-center gap-3 ${selected === r.p.id ? "ring-2 ring-accent" : ""}`}
                  onMouseEnter={() => setSelected(r.p.id)}
                >
                  <ScoreBadge score={r.score} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{r.p.name}</div>
                    <div className="text-xs text-ink-2 truncate">{r.p.address ?? `${r.p.lat.toFixed(4)}, ${r.p.lng.toFixed(4)}`}</div>
                    <div className="text-xs text-ink-3 mt-0.5 flex flex-wrap gap-x-2">
                      {r.p.typeIds.map((id) => {
                        const t = typeById[id];
                        const s = r.p.scores[id];
                        return t ? (
                          <span key={id}>
                            {t.emoji} {s ? s.score.toFixed(1) : "–"}
                          </span>
                        ) : null;
                      })}
                      <span>· last visit {relativeDay(r.p.lastVisitAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="h-[40vh] md:h-auto md:flex-1 order-1 md:order-2">
        <MapViewLazy className="w-full h-full" markers={markers} fitKey={filter} onMarkerClick={(id) => setSelected(id)} />
      </section>
    </div>
  );
}
