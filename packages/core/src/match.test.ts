import assert from "node:assert/strict";
import { test } from "node:test";
import { matchPlace, nameSimilarity, type MatchCandidate } from "./match";

const p = (id: string, name: string, lat: number, lng: number, googleFid: string | null = null): MatchCandidate => ({
  id, name, lat, lng, googleFid,
});

const dolores = p("1", "Dolores Park", 37.7596, -122.4269);
const corona = p("2", "Corona Heights Park", 37.7652, -122.4386);
const ggp = p("3", "Golden Gate Park", 37.7694, -122.4862);
const linked = p("4", "Duboce Park", 37.7694, -122.4335, "0xaaa:0xbbb");

const google = (name: string, lat: number, lng: number, fid: string | null = null) => ({ name, lat, lng, fid });

test("name similarity ignores words like park and dog", () => {
  assert.equal(nameSimilarity("Mission Dolores Park", "Dolores Park"), 1);
  assert.equal(nameSimilarity("Corona Heights Dog Run", "Corona Heights Park"), 1);
  assert.equal(nameSimilarity("Golden Gate Park", "Dolores Park"), 0);
  assert.equal(nameSimilarity("The Park", "The Park"), 1);
});

test("a stored link wins over everything else", () => {
  const r = matchPlace(google("Duboce Park Playground", 37.77, -122.43, "0xaaa:0xbbb"), [dolores, linked]);
  assert.equal(r.kind, "linked");
  assert.equal(r.kind === "linked" && r.place.id, "4");
});

test("matches a similar name nearby even when names differ", () => {
  const r = matchPlace(google("Mission Dolores Park", 37.7602015, -122.4267959, "0x1:0x2"), [corona, dolores, ggp]);
  assert.equal(r.kind, "likely");
  assert.equal(r.kind === "likely" && r.place.id, "1");
});

test("matches a big park whose pins are far apart", () => {
  // Google's pin and OpenStreetMap's centre for Golden Gate Park are about 300 m apart here.
  const r = matchPlace(google("Golden Gate Park", 37.7689203, -122.482977), [ggp]);
  assert.equal(r.kind, "likely");
});

test("does not match the same name in a different city", () => {
  const r = matchPlace(google("Dolores Park", 34.05, -118.25), [dolores]);
  assert.equal(r.kind, "none");
});

test("offers nearby places when no name matches", () => {
  const r = matchPlace(google("Corona Heights Summit", 37.7655, -122.4385), [p("9", "Museum Way Garden", 37.7657, -122.4390), ggp]);
  // "Corona Heights" vs "Museum Way" share no words, so only a suggestion.
  assert.equal(r.kind, "none");
  assert.equal(r.kind === "none" && r.nearby[0]?.place.id, "9");
});

test("a place already linked elsewhere is not offered again", () => {
  const r = matchPlace(google("Duboce Park", 37.7694, -122.4335, "0xccc:0xddd"), [linked]);
  assert.equal(r.kind, "none");
});
