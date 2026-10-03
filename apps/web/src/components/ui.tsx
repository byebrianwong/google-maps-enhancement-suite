"use client";

import { scoreColor } from "@repo/core";
import type { TypeWithCriteria } from "@/lib/queries";

export function ScoreBadge({
  score,
  size = "md",
  title,
}: {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  const color = scoreColor(score);
  const cls =
    size === "lg" ? "text-xl px-3 py-1 min-w-[3.2rem]" : size === "sm" ? "text-xs px-1.5 py-0.5 min-w-[2rem]" : "text-sm px-2 py-0.5 min-w-[2.6rem]";
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-lg font-bold text-white tabular-nums ${cls}`}
      style={{ background: color }}
    >
      {score == null ? "–" : score.toFixed(1)}
    </span>
  );
}

export function ScoreBar({ score }: { score: number | null | undefined }) {
  const pct = score == null ? 0 : ((score - 1) / 4) * 100;
  return (
    <div className="score-bar">
      <div style={{ width: `${pct}%`, background: scoreColor(score) }} />
    </div>
  );
}

export function TypeChips({
  types,
  value,
  onChange,
  allowAll,
}: {
  types: Pick<TypeWithCriteria, "id" | "name" | "emoji">[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
      {allowAll && (
        <button type="button" className="chip" data-active={value === "all"} onClick={() => onChange("all")}>
          All
        </button>
      )}
      {types.map((t) => (
        <button key={t.id} type="button" className="chip" data-active={value === t.id} onClick={() => onChange(t.id)}>
          <span>{t.emoji}</span>
          {t.name}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { id: T; label: string; emoji?: string }[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-colors ${value === o.id ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2"}`}
          title={o.label}
        >
          {o.emoji && <span className={compact ? "" : "mr-1"}>{o.emoji}</span>}
          {!compact && o.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-50 bg-ink text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
      {message}
    </div>
  );
}

export function directionsUrl(lat: number, lng: number, mode: "drive" | "walk" | "bike") {
  const tm = mode === "drive" ? "driving" : mode === "walk" ? "walking" : "bicycling";
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${tm}`;
}
