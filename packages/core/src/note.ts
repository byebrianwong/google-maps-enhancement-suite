import { moons } from "./moons";

// The text this app writes into a place's note in a Google Maps list.
//
// The note has two parts. Our part sits at the top and is rewritten on every
// update. Anything below it is the person's own text and is never changed.
//
//   🐕 🌕🌕🌕🌕🌗 4.4
//   👶 🌕🌕🌕🌑🌑 3.0
//   🌙 Park Picker · last visit Sep 25
//   (your own notes, kept as they are)
//
// Our part is recognised by its shape: zero or more rating lines followed by
// the footer line. If the top of a note does not have that shape, the note
// has no part of ours and the new block is added above it.

export const NOTE_FOOTER_LABEL = "🌙 Park Picker";

export type NoteType = { emoji: string; score: number | null };

export type NoteInput = {
  types: NoteType[]; // in display order
  lastVisitAt: number | null; // epoch ms
  timeZone?: string; // for the date; defaults to the runtime's zone
};

export function formatShortDate(epochMs: number, timeZone?: string): string {
  return new Date(epochMs).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

export function buildNote(input: NoteInput): string {
  const lines: string[] = [];
  for (const t of input.types) {
    if (t.score == null) continue;
    lines.push(`${t.emoji} ${moons(t.score)} ${t.score.toFixed(1)}`);
  }
  const footer = [NOTE_FOOTER_LABEL];
  if (lines.length === 0) footer.push("not rated yet");
  if (input.lastVisitAt != null) footer.push(`last visit ${formatShortDate(input.lastVisitAt, input.timeZone)}`);
  lines.push(footer.join(" · "));
  return lines.join("\n");
}

// Our block, matched from the very start of the note. The footer has a fixed
// shape, so the block can be found even if Google Maps turns line breaks into
// spaces (not checked yet; a one-line field would do that).
const BLOCK =
  /^\s*(?:\S+ [🌕🌗🌑]{5} \d\.\d\s+)*🌙 Park Picker(?: · not rated yet)?(?: · last visit [A-Z][a-z]{2,3} \d{1,2})?(?=\s|$)/u;

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
