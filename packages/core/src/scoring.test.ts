import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWeight, scoreForType, weightShares } from "./scoring";

const grass = { id: "grass", weight: 2 };
const space = { id: "space", weight: 1 };
const water = { id: "water", weight: 0 };

test("weighted average of the rated criteria", () => {
  const s = scoreForType({ grass: 5, space: 2 }, [grass, space]);
  assert.deepEqual(s, { score: 4, rated: 2, total: 2 });
});

test("unrated criteria are left out, not counted as low", () => {
  const s = scoreForType({ grass: 4 }, [grass, space]);
  assert.deepEqual(s, { score: 4, rated: 1, total: 2 });
});

test("a criterion with weight 0 is rated but does not change the score", () => {
  const s = scoreForType({ grass: 5, space: 3, water: 1 }, [grass, space, water]);
  assert.equal(s?.score.toFixed(3), (13 / 3).toFixed(3));
  assert.equal(s?.rated, 3);
  assert.equal(s?.total, 3);
});

test("no score when only criteria that do not count are rated", () => {
  assert.equal(scoreForType({ water: 5 }, [grass, water]), null);
  assert.equal(scoreForType({}, [grass]), null);
  assert.equal(scoreForType({ grass: 3 }, []), null);
});

test("shares add up to 1 over the criteria that count", () => {
  assert.deepEqual(weightShares([grass, space, water]), { grass: 2 / 3, space: 1 / 3, water: 0 });
  assert.deepEqual(weightShares([water]), { water: 0 });
});

test("weights print without trailing zeros", () => {
  assert.equal(formatWeight(1), "1");
  assert.equal(formatWeight(0.75), "0.75");
  assert.equal(formatWeight(2.5), "2.5");
});
