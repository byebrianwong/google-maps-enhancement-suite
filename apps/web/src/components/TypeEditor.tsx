"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  buildNote,
  formatWeight,
  noteInputFor,
  scoreForType,
  weightShares,
  type RatingMap,
  type WeightedCriterion,
} from "@repo/core";
import { deletePlaceType, saveType, type TypeInput } from "@/lib/actions";
import type { TypeWithCriteria } from "@/lib/queries";
import { ScoreBadge, Toast } from "./ui";

// The editor for one place type: what you rate, what a 1 and a 5 mean, how
// much each criterion counts in the overall score, and what the Chrome
// extension writes into notes in the type's Google Maps list.
//
// Changes are kept in a draft and saved together, so the preview can show
// what the new settings would do to your places before anything changes.

export type EditorPlace = { id: string; name: string; ratingMap: RatingMap; lastVisitAt: number | null };

type Props = {
  type: TypeWithCriteria;
  places: EditorPlace[]; // places that have this type
  ratingCounts: Record<string, number>; // by criterion id
};

const SLIDER_MAX = 3;

// Starts a fresh draft whenever the saved type changes, so after a save the
// draft matches the database (new criteria now have their real ids).
export function TypeEditorShell(props: Props) {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <TypeEditor
        key={JSON.stringify(props.type)}
        {...props}
        onSaved={() => {
          setToast("Saved");
          setTimeout(() => setToast(null), 2000);
        }}
      />
      <Toast message={toast} />
    </>
  );
}

type DraftCriterion = {
  key: string; // the id for saved criteria, a temporary key for new ones
  id: string | null; // null until saved
  label: string;
  lowLabel: string;
  highLabel: string;
  weight: number;
  removed: boolean; // saved criteria stay listed until save, so removing can be undone
};

type Draft = {
  name: string;
  emoji: string;
  color: string;
  googleListName: string;
  noteShowsRatings: boolean;
  criteria: DraftCriterion[];
};

function toDraft(type: TypeWithCriteria): Draft {
  return {
    name: type.name,
    emoji: type.emoji,
    color: type.color,
    googleListName: type.googleListName ?? "",
    noteShowsRatings: type.noteShowsRatings,
    criteria: type.criteria.map((c) => ({
      key: c.id,
      id: c.id,
      label: c.label,
      lowLabel: c.lowLabel,
      highLabel: c.highLabel,
      weight: c.weight,
      removed: false,
    })),
  };
}

function toInput(d: Draft): TypeInput {
  return {
    name: d.name.trim(),
    emoji: d.emoji.trim(),
    color: d.color,
    googleListName: d.googleListName.trim() || null,
    noteShowsRatings: d.noteShowsRatings,
    criteria: d.criteria
      .filter((c) => !c.removed)
      .map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        label: c.label.trim(),
        lowLabel: c.lowLabel.trim(),
        highLabel: c.highLabel.trim(),
        weight: c.weight,
      })),
  };
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function TypeEditor({ type, places, ratingCounts, onSaved }: Props & { onSaved: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(type));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const savedInput = useMemo(() => JSON.stringify(toInput(toDraft(type))), [type]);
  const input = toInput(draft);
  const dirty = JSON.stringify(input) !== savedInput;
  const problem = !input.name
    ? "Give the type a name."
    : !input.emoji
      ? "Pick an icon for the type."
      : input.criteria.some((c) => !c.label)
        ? "Every criterion needs a name."
        : null;

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const live = draft.criteria.filter((c) => !c.removed);
  const weighted: WeightedCriterion[] = live.map((c) => ({ id: c.id ?? c.key, weight: c.weight }));
  const shares = weightShares(weighted);
  const counted = live.filter((c) => c.weight > 0);
  const maxShare = Math.max(...Object.values(shares), 0) || 1;
  const notCounted = live.filter((c) => !(c.weight > 0));
  const listName = draft.googleListName.trim() || draft.name.trim() || type.name;

  const rows = places
    .map((p) => ({
      p,
      before: scoreForType(p.ratingMap, type.criteria)?.score ?? null,
      after: scoreForType(p.ratingMap, weighted)?.score ?? null,
    }))
    .sort((a, b) => (b.after ?? -1) - (a.after ?? -1) || a.p.name.localeCompare(b.p.name));

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function patchCriterion(key: string, p: Partial<DraftCriterion>) {
    setDraft((d) => ({ ...d, criteria: d.criteria.map((c) => (c.key === key ? { ...c, ...p } : c)) }));
  }

  function move(key: string, by: -1 | 1) {
    setDraft((d) => {
      const list = [...d.criteria];
      const i = list.findIndex((c) => c.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, criteria: list };
    });
  }

  function remove(key: string) {
    setDraft((d) => ({
      ...d,
      // A new criterion was never saved, so it just goes.
      criteria: d.criteria.flatMap((c) => (c.key !== key ? [c] : c.id ? [{ ...c, removed: true }] : [])),
    }));
  }

  function add() {
    const key = `new-${crypto.randomUUID()}`;
    setDraft((d) => ({
      ...d,
      criteria: [...d.criteria, { key, id: null, label: "", lowLabel: "", highLabel: "", weight: 1, removed: false }],
    }));
    setFocusKey(key);
  }

  function save() {
    if (problem) return;
    setError(null);
    startSave(async () => {
      try {
        await saveType(type.id, input);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function deleteType() {
    const ratingTotal = type.criteria.reduce((n, c) => n + (ratingCounts[c.id] ?? 0), 0);
    const message =
      `Delete "${type.name}"? This removes its ${type.criteria.length} criteria and ${ratingTotal} rating${ratingTotal === 1 ? "" : "s"}. ` +
      `Your places stay saved, without this type.`;
    if (confirm(message)) startDelete(() => deletePlaceType(type.id));
  }

  return (
    <div className="p-4 max-w-5xl mx-auto w-full space-y-4 pb-28 md:pb-24">
      <Link href="/settings" className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft size={16} /> Settings
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {draft.emoji} {draft.name.trim() || type.name}
        </h1>
        <p className="text-sm text-ink-2 mt-1">
          Choose what you rate for this type, what the ends of each scale mean, and how the ratings add up to one score.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-4 min-w-0">
          {/* Basics */}
          <section className="card p-4 space-y-3">
            <h2 className="font-semibold">Name and Google Maps list</h2>
            <div className="grid grid-cols-[4rem_1fr_3.5rem] gap-2">
              <div>
                <label className="label" htmlFor="t-emoji">Icon</label>
                <input id="t-emoji" className="input text-center" value={draft.emoji} onChange={(e) => patch({ emoji: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="t-name">Name</label>
                <input id="t-name" className="input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="t-color">Color</label>
                <input
                  id="t-color"
                  type="color"
                  className="h-[42px] w-full rounded-xl border border-line bg-surface"
                  value={draft.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="t-list">Google Maps list</label>
              <input
                id="t-list"
                className="input"
                placeholder={draft.name.trim() || type.name}
                value={draft.googleListName}
                onChange={(e) => patch({ googleListName: e.target.value })}
              />
              <p className="text-xs text-ink-3 mt-1">
                The name of your list in Google Maps that holds these places. The Chrome extension shows it so you can pick
                which list you are filling notes in. Leave it empty to use the type&apos;s name.
              </p>
            </div>
          </section>

          {/* Criteria */}
          <section className="card p-4 space-y-3">
            <div>
              <h2 className="font-semibold">What you rate</h2>
              <p className="text-sm text-ink-2 mt-0.5">
                Each criterion is rated 1 to 5. Say what a 1 and a 5 mean, so a rating means the same thing every time.
              </p>
            </div>
            {draft.criteria.length === 0 && (
              <p className="text-sm text-ink-3 rounded-xl bg-surface-2 p-3">
                Nothing to rate yet. Add the things that make a place good for this kind of trip.
              </p>
            )}
            <ol className="space-y-2">
              {draft.criteria.map((c, i) =>
                c.removed ? (
                  <RemovedRow
                    key={c.key}
                    label={c.label}
                    ratings={ratingCounts[c.key] ?? 0}
                    onUndo={() => patchCriterion(c.key, { removed: false })}
                  />
                ) : (
                  <CriterionRow
                    key={c.key}
                    c={c}
                    isNew={!c.id}
                    autoFocus={focusKey === c.key}
                    share={shares[c.id ?? c.key] ?? 0}
                    first={i === 0}
                    last={i === draft.criteria.length - 1}
                    onChange={(p) => patchCriterion(c.key, p)}
                    onMove={(by) => move(c.key, by)}
                    onRemove={() => remove(c.key)}
                  />
                ),
              )}
            </ol>
            <button type="button" className="btn btn-sm" onClick={add}>
              <Plus size={14} /> Add criterion
            </button>
            <datalist id="weight-ticks">
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </section>

          <section className="card p-4 space-y-2">
            <h2 className="font-semibold">Delete this type</h2>
            <p className="text-sm text-ink-2">
              Removes the type, its criteria and every rating for them. Your places stay saved.
            </p>
            <button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={deleteType}>
              <Trash2 size={14} /> Delete {type.name}
            </button>
          </section>
        </div>

        <aside className="space-y-4 min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-20">
          {/* How the score adds up */}
          <section className="card p-4 space-y-3">
            <h2 className="font-semibold">How the overall score works</h2>
            <p className="text-sm text-ink-2">
              A place&apos;s score is the average of its ratings, weighted by how much each criterion counts. Criteria you
              haven&apos;t rated for a place are skipped, so they don&apos;t pull its score down.
            </p>
            {live.length === 0 ? (
              <p className="text-sm text-ink-3">Add a criterion to start scoring places.</p>
            ) : counted.length === 0 ? (
              <p className="text-sm text-danger">Nothing counts toward the score, so places get no score.</p>
            ) : (
              <>
                <div className="text-xs text-ink-3">Share of the score when everything is rated</div>
                <ul className="space-y-1.5">
                  {counted.map((c) => {
                    const share = shares[c.id ?? c.key] ?? 0;
                    return (
                      <li key={c.key} className="grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-2 text-sm">
                        <span className="truncate" title={c.label}>{c.label.trim() || "New criterion"}</span>
                        {/* Bars are drawn against the largest share, so small differences show. The number is exact. */}
                        <div className="score-bar" aria-hidden>
                          <div style={{ width: percent(share / maxShare), background: draft.color }} />
                        </div>
                        <span className="text-right tabular-nums text-ink-2">{percent(share)}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {notCounted.length > 0 && (
              <p className="text-xs text-ink-3">
                Not counted: {notCounted.map((c) => c.label.trim() || "New criterion").join(", ")}. You still rate{" "}
                {notCounted.length === 1 ? "it" : "them"} and see {notCounted.length === 1 ? "it" : "them"} on the place,
                but {notCounted.length === 1 ? "it doesn't" : "they don't"} change the score.
              </p>
            )}
          </section>

          <PlacesPreview rows={rows} />

          <NotePreview
            type={type}
            draft={draft}
            listName={listName}
            places={rows.map((r) => r.p)}
            weighted={weighted}
            onShowRatings={(v) => patch({ noteShowsRatings: v })}
          />
        </aside>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Unsaved changes</span>
              {(problem || error) && <span className="block text-xs text-danger truncate">{problem ?? error}</span>}
            </div>
            <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setDraft(toDraft(type))}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !!problem} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({
  c,
  isNew,
  autoFocus,
  share,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  c: DraftCriterion;
  isNew: boolean;
  autoFocus: boolean;
  share: number;
  first: boolean;
  last: boolean;
  onChange: (p: Partial<DraftCriterion>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const name = c.label.trim() || "this criterion";
  const counts = c.weight > 0;
  return (
    <li className="rounded-xl border border-line p-3 space-y-2.5">
      <div className="flex items-center gap-1">
        <input
          className="input font-semibold !py-1.5"
          placeholder="What you rate, e.g. Parking"
          aria-label="Criterion name"
          value={c.label}
          autoFocus={autoFocus}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        {isNew && <span className="text-[11px] font-semibold text-accent px-1">New</span>}
        <button type="button" className="btn btn-ghost btn-sm !px-2" disabled={first} onClick={() => onMove(-1)} title="Move up" aria-label={`Move ${name} up`}>
          <ArrowUp size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-sm !px-2" disabled={last} onClick={() => onMove(1)} title="Move down" aria-label={`Move ${name} down`}>
          <ArrowDown size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-sm !px-2 text-ink-3" onClick={onRemove} title="Remove" aria-label={`Remove ${name}`}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-ink-3">1 means</span>
          <input
            className="input !py-1.5 text-sm"
            placeholder="e.g. No parking"
            value={c.lowLabel}
            onChange={(e) => onChange({ lowLabel: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-ink-3">5 means</span>
          <input
            className="input !py-1.5 text-sm"
            placeholder="e.g. Always a spot"
            value={c.highLabel}
            onChange={(e) => onChange({ highLabel: e.target.value })}
          />
        </label>
      </div>
      {/* On a phone the slider gets its own full-width row, so it is easy to drag. */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 sm:flex">
        <span className="text-[11px] font-semibold text-ink-3 w-12 shrink-0">Counts</span>
        <input
          type="range"
          min={0}
          max={Math.max(SLIDER_MAX, c.weight)}
          step={0.25}
          list="weight-ticks"
          className="col-span-2 row-start-2 w-full sm:flex-1 sm:min-w-0 accent-accent"
          value={c.weight}
          aria-label={`How much ${name} counts`}
          aria-valuetext={counts ? `${formatWeight(c.weight)} times, ${percent(share)} of the score` : "Not counted"}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
        />
        <span className={`text-xs tabular-nums min-w-24 shrink-0 whitespace-nowrap text-right ${counts ? "text-ink-2" : "text-ink-3"}`}>
          {counts ? (
            <>
              <b className="text-ink">{formatWeight(c.weight)}×</b> · {percent(share)} of score
            </>
          ) : (
            "Not counted"
          )}
        </span>
      </div>
    </li>
  );
}

function RemovedRow({ label, ratings, onUndo }: { label: string; ratings: number; onUndo: () => void }) {
  return (
    <li className="rounded-xl border border-dashed border-line p-3 flex items-center gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <span className="line-through text-ink-3">{label}</span>
        <span className="block text-xs text-ink-3">
          Removed when you save
          {ratings > 0 ? `, with its ${ratings} rating${ratings === 1 ? "" : "s"}` : ""}.
        </span>
      </div>
      <button type="button" className="btn btn-sm" onClick={onUndo}>
        <Undo2 size={14} /> Undo
      </button>
    </li>
  );
}

function PlacesPreview({ rows }: { rows: { p: EditorPlace; before: number | null; after: number | null }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold">Your places with these settings</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">No places have this type yet.</p>
      ) : (
        <>
          <ol className="divide-y divide-line">
            {shown.map(({ p, before, after }) => {
              const changed = (before == null) !== (after == null) || (before != null && after != null && Math.abs(before - after) >= 0.05);
              return (
                <li key={p.id} className="py-1.5 flex items-center gap-2 text-sm">
                  <ScoreBadge score={after} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {changed && (
                    <span className="text-xs text-ink-3 tabular-nums shrink-0">
                      {after != null && before != null ? (after > before ? "▲" : "▼") : ""} was {before == null ? "–" : before.toFixed(1)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {rows.length > shown.length && (
            <button type="button" className="text-xs text-ink-2 underline" onClick={() => setAll(true)}>
              Show all {rows.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NotePreview({
  type,
  draft,
  listName,
  places,
  weighted,
  onShowRatings,
}: {
  type: TypeWithCriteria;
  draft: Draft;
  listName: string;
  places: EditorPlace[];
  weighted: WeightedCriterion[];
  onShowRatings: (v: boolean) => void;
}) {
  const [exampleId, setExampleId] = useState<string | null>(null);
  const example = places.find((p) => p.id === exampleId) ?? places[0] ?? null;
  // New criteria have no ratings yet, so they never show in a note.
  const noteType = {
    id: type.id,
    emoji: draft.emoji.trim() || type.emoji,
    noteShowsRatings: draft.noteShowsRatings,
    criteria: draft.criteria.flatMap((c) => (!c.removed && c.id ? [{ id: c.id, label: c.label.trim() || "?" }] : [])),
  };
  const note = example
    ? buildNote(
        noteInputFor(
          {
            typeIds: [type.id],
            scores: { [type.id]: scoreForType(example.ratingMap, weighted)?.score ?? null },
            ratings: example.ratingMap,
            lastVisitAt: example.lastVisitAt,
          },
          [noteType],
          type.id,
        ),
      )
    : null;
  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-semibold">Google Maps note</h2>
      <p className="text-sm text-ink-2">
        When you fill a note in your &ldquo;{listName}&rdquo; list, the extension writes this at the top. Your own text stays
        below it.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-accent size-4" checked={draft.noteShowsRatings} onChange={(e) => onShowRatings(e.target.checked)} />
        Show each rating below the score
      </label>
      {note == null ? (
        <p className="text-sm text-ink-3">Add a place of this type to see an example.</p>
      ) : (
        <>
          <pre className="rounded-xl bg-surface-2 p-3 text-sm leading-6 whitespace-pre-wrap font-sans">{note}</pre>
          {places.length > 1 && (
            <select
              className="input !py-1.5 text-sm"
              aria-label="Example place"
              value={example?.id}
              onChange={(e) => setExampleId(e.target.value)}
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  Example: {p.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      <p className="text-xs text-ink-3">
        Filling with &ldquo;All types&rdquo; picked in the extension writes one short line per type instead, for lists that mix types.
      </p>
    </section>
  );
}
