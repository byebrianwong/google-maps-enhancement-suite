import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNote, flattenNote, mergeNote, splitNote } from "./note";

const sep25 = Date.UTC(2026, 8, 25, 18, 0);

test("builds one line per rated type and a footer", () => {
  const note = buildNote({
    types: [
      { emoji: "🐕", score: 4.4 },
      { emoji: "👶", score: 3 },
    ],
    lastVisitAt: sep25,
    timeZone: "America/Los_Angeles",
  });
  assert.equal(note, "🐕 🌕🌕🌕🌕🌗 4.4\n👶 🌕🌕🌕🌑🌑 3.0\n🌙 Park Picker · last visit Sep 25");
});

test("skips unrated types and says so when nothing is rated", () => {
  assert.equal(
    buildNote({ types: [{ emoji: "🐕", score: 4 }, { emoji: "👶", score: null }], lastVisitAt: null }),
    "🐕 🌕🌕🌕🌕🌑 4.0\n🌙 Park Picker",
  );
  assert.equal(buildNote({ types: [{ emoji: "🐕", score: null }], lastVisitAt: null }), "🌙 Park Picker · not rated yet");
});

test("adds our block above a note that has none, keeping the person's text", () => {
  const block = "🐕 🌕🌕🌕🌗🌑 3.5\n🌙 Park Picker";
  assert.equal(mergeNote("Park on 18th St.\nMuddy after rain", block), `${block}\nPark on 18th St.\nMuddy after rain`);
  assert.equal(mergeNote("", block), block);
  assert.equal(mergeNote("   ", block), block);
});

test("replaces our old block and keeps everything below it exactly", () => {
  const old = "🐕 🌕🌕🌑🌑🌑 2.0\n👶 🌕🌕🌕🌑🌑 3.0\n🌙 Park Picker · last visit Sep 1\nPark on 18th St.\n\n  indented line";
  const block = "🐕 🌕🌕🌕🌕🌗 4.4\n🌙 Park Picker · last visit Sep 25";
  assert.equal(mergeNote(old, block), `${block}\nPark on 18th St.\n\n  indented line`);
});

test("updating twice gives the same result as updating once", () => {
  const block = "🐕 🌕🌕🌕🌕🌗 4.4\n🌙 Park Picker";
  const once = mergeNote("my note", block);
  assert.equal(mergeNote(once, block), once);
});

test("does not treat the person's text as ours", () => {
  // Rating-shaped lines without our footer below them are left alone.
  const theirs = "🐕 🌕🌕🌕🌕🌕 5.0\nbest park ever";
  assert.deepEqual(splitNote(theirs), { ours: null, rest: theirs });
  // Our footer text in the middle of their note is not at the top, so it is not ours.
  const middle = "note first\n🌙 Park Picker";
  assert.equal(splitNote(middle).ours, null);
});

test("handles Windows line endings", () => {
  const { ours, rest } = splitNote("🐕 🌕🌕🌕🌕🌑 4.0\r\n🌙 Park Picker\r\nmine");
  assert.equal(ours, "🐕 🌕🌕🌕🌕🌑 4.0\n🌙 Park Picker");
  assert.equal(rest, "mine");
});

test("finds our block when line breaks became spaces", () => {
  const block = "🐕 🌕🌕🌕🌕🌗 4.4\n👶 🌕🌕🌕🌑🌑 3.0\n🌙 Park Picker · last visit Sep 25";
  const flat = flattenNote(`${block}\nPark on 18th St.`);
  assert.equal(flat, "🐕 🌕🌕🌕🌕🌗 4.4  👶 🌕🌕🌕🌑🌑 3.0  🌙 Park Picker · last visit Sep 25  Park on 18th St.");
  const { ours, rest } = splitNote(flat);
  assert.equal(ours, "🐕 🌕🌕🌕🌕🌗 4.4  👶 🌕🌕🌕🌑🌑 3.0  🌙 Park Picker · last visit Sep 25");
  assert.equal(rest, "Park on 18th St.");
});

test("does not swallow the person's text that follows the footer on the same line", () => {
  const { rest } = splitNote("🌙 Park Picker · not rated yet 2 benches by the gate");
  assert.equal(rest, "2 benches by the gate");
});

test("a type's ratings go on one line below its score", () => {
  const note = buildNote({
    types: [{ emoji: "🐕", score: 4.5, ratings: [{ label: "Grass quality", value: 5 }, { label: "Room to run", value: 4 }] }],
    lastVisitAt: sep25,
    timeZone: "America/Los_Angeles",
  });
  assert.equal(note, "🐕 🌕🌕🌕🌕🌗 4.5\nGrass quality 5/5 · Room to run 4/5\n🌙 Park Picker · last visit Sep 25");
});

test("an empty ratings list adds no line", () => {
  assert.equal(buildNote({ types: [{ emoji: "🐕", score: 4, ratings: [] }], lastVisitAt: null }), "🐕 🌕🌕🌕🌕🌑 4.0\n🌙 Park Picker");
});

test("labels lose line breaks and moons so the line stays one line and is not a footer", () => {
  const note = buildNote({ types: [{ emoji: "🐕", score: 3, ratings: [{ label: "Night\n🌙 light", value: 3 }] }], lastVisitAt: null });
  assert.equal(note, "🐕 🌕🌕🌕🌑🌑 3.0\nNight light 3/5\n🌙 Park Picker");
});

test("finds a block with ratings lines and keeps the person's text", () => {
  const block = "🐕 🌕🌕🌕🌕🌗 4.5\nGrass quality 5/5 · Room to run 4/5\n🌙 Park Picker · last visit Sep 25";
  assert.deepEqual(splitNote(`${block}\nPark on 18th St.`), { ours: block, rest: "Park on 18th St." });
  const two = "🐕 🌕🌕🌕🌕🌗 4.5\nGrass 5/5\n👶 🌕🌕🌕🌑🌑 3.0\nPaths 3/5\n🌙 Park Picker\nmine";
  assert.equal(splitNote(two).rest, "mine");
});

test("a list note replaces an all-types note and the other way round", () => {
  const all = "🐕 🌕🌕🌕🌕🌗 4.5\n👶 🌕🌕🌕🌑🌑 3.0\n🌙 Park Picker · last visit Sep 25";
  const list = "🐕 🌕🌕🌕🌕🌗 4.5\nGrass quality 5/5 · Room to run 4/5\n🌙 Park Picker · last visit Sep 25";
  assert.equal(mergeNote(`${all}\nmine`, list), `${list}\nmine`);
  assert.equal(mergeNote(`${list}\nmine`, all), `${all}\nmine`);
});

test("finds a block with a ratings line when line breaks became spaces", () => {
  const block = "🐕 🌕🌕🌕🌕🌗 4.5\nGrass quality 5/5 · Room to run 4/5\n🌙 Park Picker · last visit Sep 25";
  const flat = flattenNote(`${block}\nPark on 18th St.`);
  const { ours, rest } = splitNote(flat);
  assert.equal(ours, flattenNote(block));
  assert.equal(rest, "Park on 18th St.");
});

test("a ratings line does not reach past our footer into the person's text", () => {
  const block = "🐕 🌕🌕🌕🌕🌑 4.0\nGrass 4/5\n🌙 Park Picker";
  const theirs = "copied 🌙 Park Picker by mistake";
  assert.equal(splitNote(flattenNote(`${block}\n${theirs}`)).rest, theirs);
});
