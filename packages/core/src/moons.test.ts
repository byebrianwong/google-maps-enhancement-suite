import assert from "node:assert/strict";
import { test } from "node:test";
import { moons, roundToHalf } from "./moons";

test("rounds to the nearest half", () => {
  assert.equal(roundToHalf(4.2), 4);
  assert.equal(roundToHalf(4.3), 4.5);
  assert.equal(roundToHalf(4.75), 5);
});

test("draws five moons with the lit half on the left", () => {
  assert.equal(moons(5), "🌕🌕🌕🌕🌕");
  assert.equal(moons(3.5), "🌕🌕🌕🌗🌑");
  assert.equal(moons(4.4), "🌕🌕🌕🌕🌗");
  assert.equal(moons(1), "🌕🌑🌑🌑🌑");
  assert.equal(moons(0), "🌑🌑🌑🌑🌑");
});

test("clamps out-of-range scores", () => {
  assert.equal(moons(7), "🌕🌕🌕🌕🌕");
  assert.equal(moons(-2), "🌑🌑🌑🌑🌑");
});
