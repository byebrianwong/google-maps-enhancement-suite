"use client";

import { ArrowLeft, Check, Copy, ExternalLink, Navigation, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import type { Origin, Visit } from "@/db/schema";
import { buildNote, googleMapsPlaceUrl } from "@repo/core";
import { deletePlace, deleteVisit, logVisit, setPlaceTypes, setRating, unlinkGoogle, updatePlace } from "@/lib/actions";
import { useTravelTimes } from "@/lib/hooks";
import type { PlaceSummary, Settings, TypeWithCriteria } from "@/lib/queries";
import { TRAVEL_MODES, scoreColor, scoreForType, type TravelMode } from "@repo/core";
import { formatDistance } from "@repo/core";
import { formatDateTime, formatMinutes, relativeDay, secondsToMinutes } from "@/lib/time";
import { MapViewLazy } from "./MapViewLazy";
import { ScoreBadge, ScoreBar, Segmented, directionsUrl } from "./ui";

type Props = {
  place: PlaceSummary & { visits: Visit[] };
  types: TypeWithCriteria[];
  origins: Origin[];
  settings: Settings;
};

export function PlaceDetail({ place, types, origins, settings }: Props) {
  const [, startTransition] = useTransition();
  const [ratingMap, setRatingOptimistic] = useOptimistic(place.ratingMap, (state, next: { id: string; value: number | null }) => {
    const copy = { ...state };
    if (next.value == null) delete copy[next.id];
    else copy[next.id] = next.value;
    return copy;
  });
  const [typeIds, setTypeIdsOptimistic] = useOptimistic(place.typeIds);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [notes, setNotes] = useState(place.notes ?? "");
  const [movePin, setMovePin] = useState(false);
  const [pin, setPin] = useState({ lat: place.lat, lng: place.lng });
  const [mode, setMode] = useState<TravelMode>(settings.defaultMode);
  const [originId, setOriginId] = useState<string | undefined>((origins.find((o) => o.isDefault) ?? origins[0])?.id);
  const [showVisitForm, setShowVisitForm] = useState(false);

  const origin = origins.find((o) => o.id === originId);
  const travel = useTravelTimes({
    originId: origin?.id,
    origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
    mode,
    placeIds: [place.id],
    enabled: !!origin,
  });
  const t = travel.times[place.id];

  const taggedTypes = types.filter((ty) => typeIds.includes(ty.id));

  function rate(criterionId: string, value: number | null) {
    startTransition(async () => {
      setRatingOptimistic({ id: criterionId, value });
      await setRating(place.id, criterionId, value);
    });
  }

  function toggleType(id: string) {
    const next = typeIds.includes(id) ? typeIds.filter((x) => x !== id) : [...typeIds, id];
    if (next.length === 0) return;
    startTransition(async () => {
      setTypeIdsOptimistic(next);
      await setPlaceTypes(place.id, next);
    });
  }

  function saveEdit() {
    startTransition(async () => {
      await updatePlace(place.id, { name: name.trim() || place.name, address: address.trim() || null });
      setEditing(false);
    });
  }

  function savePin() {
    startTransition(async () => {
      await updatePlace(place.id, { lat: pin.lat, lng: pin.lng });
      setMovePin(false);
    });
  }

  function saveNotes() {
    if ((place.notes ?? "") === notes) return;
    startTransition(() => updatePlace(place.id, { notes: notes.trim() || null }));
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row md:h-[calc(100dvh-3.5rem)]">
      <section className="md:w-[480px] md:shrink-0 md:overflow-y-auto md:border-r border-line order-2 md:order-1">
        <div className="p-4 space-y-5">
          <div className="flex items-center gap-2">
            <Link href="/places" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft size={16} /> Places</Link>
          </div>

          {/* Header */}
          {editing ? (
            <div className="card p-3 space-y-2">
              <input className="input font-semibold" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
              <input className="input text-sm" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" aria-label="Address" />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={saveEdit}><Check size={14} /> Save</button>
                <button className="btn btn-sm" onClick={() => setEditing(false)}><X size={14} /> Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight leading-tight">{place.name}</h1>
                {place.address && <p className="text-sm text-ink-2 mt-0.5">{place.address}</p>}
                <p className="text-xs text-ink-3 mt-1">
                  Last visit {relativeDay(place.lastVisitAt)} · {place.visitCount} visit{place.visitCount === 1 ? "" : "s"}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Edit name"><Pencil size={15} /></button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {types.map((ty) => (
              <button key={ty.id} type="button" className="chip" data-active={typeIds.includes(ty.id)} onClick={() => toggleType(ty.id)}>
                {ty.emoji} {ty.name}
                {place.scores[ty.id] && typeIds.includes(ty.id) && <span className="ml-1 opacity-80">{place.scores[ty.id]!.score.toFixed(1)}</span>}
              </button>
            ))}
          </div>

          {/* Travel */}
          <div className="card p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="label !mb-0">Getting there</div>
              <div className="ml-auto flex items-center gap-2">
                {origins.length > 1 && (
                  <select className="input !w-auto !py-1 text-xs" value={originId} onChange={(e) => setOriginId(e.target.value)} aria-label="From">
                    {origins.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>)}
                  </select>
                )}
                <Segmented options={TRAVEL_MODES} value={mode} onChange={setMode} compact />
              </div>
            </div>
            {!origin ? (
              <p className="text-sm text-ink-3">Add a starting point in <Link className="underline" href="/settings">Settings</Link> to see travel times.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold tabular-nums">
                  {t ? formatMinutes(secondsToMinutes(t.seconds)) : travel.loading ? <span className="animate-pulse-soft text-ink-3 text-base">…</span> : "–"}
                </div>
                <div className="text-sm text-ink-2">
                  each way from {origin.name}
                  {t && <> · {formatDistance(t.meters)} · round trip {formatMinutes(2 * secondsToMinutes(t.seconds))}</>}
                </div>
                <button className="btn btn-ghost btn-sm ml-auto" onClick={travel.refresh} disabled={travel.loading} title="Recompute">
                  <RefreshCw size={14} className={travel.loading ? "animate-spin" : ""} />
                </button>
              </div>
            )}
            <a className="btn btn-primary w-full" href={directionsUrl(place.lat, place.lng, mode)} target="_blank" rel="noopener">
              <Navigation size={15} /> Directions in Google Maps
            </a>
          </div>

          <GoogleNoteCard
            note={buildNote({
              types: taggedTypes.map((ty) => ({ emoji: ty.emoji, score: scoreForType(ratingMap, ty.criteria)?.score ?? null })),
              lastVisitAt: place.lastVisitAt,
            })}
            googleUrl={googleMapsPlaceUrl({ fid: place.googleFid, name: place.googleName ?? place.name, lat: place.lat, lng: place.lng })}
            linkedName={place.googleFid ? place.googleName ?? place.name : null}
            onUnlink={() => startTransition(() => unlinkGoogle(place.id))}
          />

          {/* Visits */}
          <div className="card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="label !mb-0">Visits</div>
              <button className="btn btn-sm" onClick={() => setShowVisitForm((v) => !v)}>{showVisitForm ? "Cancel" : "+ Log visit"}</button>
            </div>
            {showVisitForm && (
              <VisitForm
                types={taggedTypes}
                onSave={(v) => {
                  startTransition(async () => {
                    await logVisit({ placeId: place.id, ...v });
                    setShowVisitForm(false);
                  });
                }}
              />
            )}
            {place.visits.length === 0 ? (
              <p className="text-sm text-ink-3">No visits logged yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {place.visits.map((v) => {
                  const ty = types.find((x) => x.id === v.typeId);
                  return (
                    <li key={v.id} className="py-2 flex items-start gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {formatDateTime(v.visitedAt)} <span className="text-ink-3 font-normal">· {relativeDay(v.visitedAt)}</span>
                        </div>
                        <div className="text-xs text-ink-2">
                          {ty && <span className="mr-2">{ty.emoji} {ty.name}</span>}
                          {v.rating && <span className="mr-2">{"★".repeat(v.rating)}{"☆".repeat(5 - v.rating)}</span>}
                          {v.note}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm text-ink-3"
                        title="Delete visit"
                        onClick={() => startTransition(() => deleteVisit(v.id, place.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Ratings */}
          {taggedTypes.map((ty) => {
            const s = scoreForType(ratingMap, ty.criteria);
            return (
              <div key={ty.id} className="card p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{ty.emoji} {ty.name}</div>
                  <ScoreBadge score={s?.score} />
                  <span className="text-xs text-ink-3">{s ? `${s.rated}/${s.total} rated` : "not rated"}</span>
                </div>
                <ScoreBar score={s?.score} />
                {ty.criteria.length === 0 && <p className="text-sm text-ink-3">This type has no criteria yet. Add some in Settings.</p>}
                <ul className="space-y-3">
                  {ty.criteria.map((c) => {
                    const v = ratingMap[c.id];
                    return (
                      <li key={c.id}>
                        <div className="flex items-baseline justify-between">
                          <div className="text-sm font-medium">{c.label}</div>
                          {v != null && (
                            <button className="text-[11px] text-ink-3 underline" onClick={() => rate(c.id, null)}>clear</button>
                          )}
                        </div>
                        <div className="seg mt-1" style={{ "--seg-color": scoreColor(v ?? null) } as React.CSSProperties}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" data-on={v === n} onClick={() => rate(c.id, n)} aria-label={`${c.label} ${n} of 5`}>
                              {n}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-between text-[11px] text-ink-3 mt-0.5">
                          <span>{c.lowLabel}</span>
                          <span>{c.highLabel}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* Notes */}
          <div className="card p-3 space-y-2">
            <div className="label !mb-0">Notes</div>
            <textarea
              className="input min-h-24 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Parking tips, best entrance, when it gets busy…"
            />
          </div>

          {/* Danger zone */}
          <div className="flex gap-2 pb-4">
            <button className="btn btn-sm" onClick={() => setMovePin((v) => !v)}>{movePin ? "Cancel move" : "Move pin"}</button>
            {movePin && <button className="btn btn-primary btn-sm" onClick={savePin}><Check size={14} /> Save location</button>}
            <button
              className="btn btn-danger btn-sm ml-auto"
              onClick={() => {
                if (confirm(`Delete "${place.name}" and all its ratings and visits?`)) startTransition(() => deletePlace(place.id));
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </section>

      <section className="h-[34vh] md:h-auto md:flex-1 order-1 md:order-2">
        <MapViewLazy
          className="w-full h-full"
          markers={
            movePin
              ? []
              : [{ id: place.id, lat: place.lat, lng: place.lng, label: place.name, emoji: taggedTypes[0]?.emoji, color: scoreColor(taggedTypes[0] ? place.scores[taggedTypes[0].id]?.score : null), selected: true }]
          }
          origin={origin ? { lat: origin.lat, lng: origin.lng, emoji: origin.emoji } : null}
          fitKey={`${place.id}|${originId}|${movePin}`}
          draggable={movePin ? { lat: pin.lat, lng: pin.lng, onDragEnd: setPin } : null}
        />
      </section>
    </div>
  );
}

function VisitForm({
  types,
  onSave,
}: {
  types: TypeWithCriteria[];
  onSave: (v: { typeId: string | null; visitedAt: number; rating: number | null; note: string | null }) => void;
}) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [when, setWhen] = useState(local);
  const [typeId, setTypeId] = useState<string | null>(types[0]?.id ?? null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="rounded-xl bg-surface-2 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="when">When</label>
          <input id="when" type="datetime-local" className="input !py-1.5 text-sm" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="for">Went for</label>
          <select id="for" className="input !py-1.5 text-sm" value={typeId ?? ""} onChange={(e) => setTypeId(e.target.value || null)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
            <option value="">Other</option>
          </select>
        </div>
      </div>
      <div>
        <div className="label">How was it?</div>
        <div className="seg" style={{ "--seg-color": scoreColor(rating) } as React.CSSProperties}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" data-on={rating === n} onClick={() => setRating(rating === n ? null : n)}>{n}</button>
          ))}
        </div>
      </div>
      <input className="input text-sm" placeholder="Note (optional): muddy after rain, great at 8am…" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn btn-primary btn-sm w-full"
        onClick={() => onSave({ typeId, visitedAt: new Date(when).getTime() || Date.now(), rating, note: note || null })}
      >
        Save visit
      </button>
    </div>
  );
}

// What the Chrome extension writes into this place's note in your Google Maps
// lists. Copy works on a phone too: copy here, then paste into the note in
// the Google Maps app.
function GoogleNoteCard({
  note,
  googleUrl,
  linkedName,
  onUnlink,
}: {
  note: string;
  googleUrl: string;
  linkedName: string | null;
  onUnlink: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-3 space-y-2">
      <div className="label !mb-0">Google Maps note</div>
      <pre className="rounded-xl bg-surface-2 p-3 text-base leading-7 whitespace-pre-wrap font-sans">{note}</pre>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            navigator.clipboard.writeText(note).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy note"}
        </button>
        <a className="btn btn-sm" href={googleUrl} target="_blank" rel="noopener">
          Open in Google Maps <ExternalLink size={13} />
        </a>
      </div>
      {linkedName ? (
        <p className="text-xs text-ink-3">
          Linked to &ldquo;{linkedName}&rdquo; in Google Maps.{" "}
          <button type="button" className="underline" onClick={onUnlink}>Unlink</button>
        </p>
      ) : (
        <p className="text-xs text-ink-3">
          Not linked to a Google Maps place yet. Open the place in Google Maps with the extension installed to link it.
        </p>
      )}
    </div>
  );
}
