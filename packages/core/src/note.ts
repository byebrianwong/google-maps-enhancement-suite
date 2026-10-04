import { moons } from "./moons";

// The text this app writes into a place's note in a Google Maps list.
//
// The note has two parts. Our part sits at the top and is rewritten on every
// update. Anything below it is the person's own text and is never changed.
//
// A note for all types has one line per type:
//
//   🐕 🌕🌕🌕🌕🌗 4.4
//   👶 🌕🌕🌕🌑🌑 3.0
//   🌙 Park Picker · last visit Sep 25
//   (your own notes, kept as they are)
//
// A note for one type's list (say, your "Dog parks" list) has that type's
// line, and below it each rating, if the type is set to show them:
//
//   🐕 🌕🌕🌕🌕🌗 4.4
//   Grass quality 5/5 · Room to run 4/5
//   🌙 Park Picker · last visit Sep 25
//
// Our part is recognised by its shape: zero or more score lines, each with
// an optional ratings line, followed by the footer line. If the top of a
// note does not have that shape, the note has no part of ours and the new
// block is added above it. Notes written before the ratings line existed
// have the same shape without it, so they are still recognised.

export const NOTE_FOOTER_LABEL = "🌙 Park Picker";

export type NoteRating = { label: string; value: number };

export type NoteType = {
  emoji: string;
  score: number | null;
  ratings?: NoteRating[]; // shown on a line below the score, if any
};

export type NoteInput = {
  types: NoteType[]; // in display order
  lastVisitAt: number | null; // epoch ms
  timeZone?: string; // for the date; defaults to the runtime's zone
};

export function formatShortDate(epochMs: number, timeZone?: string): string {
  return new Date(epochMs).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

// "Grass quality 5/5 · Room to run 4/5". Labels are put on one line and lose
// any 🌙, so the line cannot be mistaken for our footer.
export function formatRatings(ratings: NoteRating[]): string {
  return ratings
    .map((r) => `${r.label.replace(/🌙/gu, "").replace(/\s+/g, " ").trim()} ${r.value}/5`)
    .join(" · ");
}

export function buildNote(input: NoteInput): string {
  const lines: string[] = [];
  for (const t of input.types) {
    if (t.score == null) continue;
    lines.push(`${t.emoji} ${moons(t.score)} ${t.score.toFixed(1)}`);
    if (t.ratings && t.ratings.length > 0) lines.push(formatRatings(t.ratings));
  }
  const footer = [NOTE_FOOTER_LABEL];
  if (lines.length === 0) footer.push("not rated yet");
  if (input.lastVisitAt != null) footer.push(`last visit ${formatShortDate(input.lastVisitAt, input.timeZone)}`);
  lines.push(footer.join(" · "));
  return lines.join("\n");
}

// Our block, matched from the very start of the note. The footer has a fixed
// shape, so the block can be found even if Google Maps turns line breaks into
// spaces (not checked yet; a one-line field would do that). A ratings line
// can hold any label text, so it may not contain 🌙: that stops it from
// running past our footer into the person's own text.
const SCORE_LINE = String.raw`\S+ [🌕🌗🌑]{5} \d\.\d\s+`;
const RATING = String.raw`[^\n🌙]+? [1-5]\/5`;
const RATINGS_LINE = String.raw`(?:${RATING}(?: · ${RATING})*\s+)?`;
const FOOTER = String.raw`🌙 Park Picker(?: · not rated yet)?(?: · last visit [A-Z][a-z]{2,3} \d{1,2})?(?=\s|$)`;
const BLOCK = new RegExp(String.raw`^\s*(?:${SCORE_LINE}${RATINGS_LINE})*${FOOTER}`, "u");

// Splits a note into our block and the person's own text.
export function splitNote(note: string): { ours: string | null; rest: string } {
  const normalized = note.replace(/\r\n/g, "\n");
  const m = BLOCK.exec(normalized);
  if (!m) return { ours: null, rest: note };
  const ours = m[0].trim();
  // Drop the one separator after our block: spaces, then line breaks.
  const rest = normalized.slice(m[0].length).replace(/^[ \t]*\n*/, "");
  return { ours, rest };
}

// Replaces our block in an existing note, or adds it on top. The person's
// own text is kept exactly.
export function mergeNote(existing: string, block: string): string {
  const { rest } = splitNote(existing);
  return rest.trim() === "" ? block : `${block}\n${rest}`;
}

// The same note on one line, for a single-line text box.
export function flattenNote(note: string): string {
  return note.replace(/\s*\n\s*/g, "  ");
}
