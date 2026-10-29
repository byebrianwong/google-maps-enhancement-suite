import assert from "node:assert/strict";
import { test } from "node:test";
import { noteInputFor, typeForListTitle, type NotePlace, type NoteTypeConfig } from "./api";

const dog: NoteTypeConfig = {
  id: "dog",
  emoji: "🐕",
  noteShowsRatings: true,
  criteria: [
    { id: "grass", label: "Grass quality" },
    { id: "space", label: "Room to run" },
    { id: "shade", label: "Shade" },
  ],
};
const baby: NoteTypeConfig = { id: "baby", emoji: "👶", noteShowsRatings: true, criteria: [{ id: "paths", label: "Stroller paths" }] };

const place: NotePlace = {
  typeIds: ["dog", "baby"],
  scores: { dog: 4.5, baby: 3 },
  ratings: { grass: 5, space: 4, paths: 3 },
  lastVisitAt: 123,
};

test("the all-types note has one score per type and no ratings", () => {
  assert.deepEqual(noteInputFor(place, [dog, baby]), {
    types: [
      { emoji: "🐕", score: 4.5 },
      { emoji: "👶", score: 3 },
    ],
    lastVisitAt: 123,
  });
});

test("a list note has only that type, with its rated criteria in order", () => {
  assert.deepEqual(noteInputFor(place, [dog, baby], "dog"), {
    types: [
      {
        emoji: "🐕",
        score: 4.5,
        ratings: [
          { label: "Grass quality", value: 5 },
          { label: "Room to run", value: 4 },
        ],
      },
    ],
    lastVisitAt: 123,
  });
});

test("a list note leaves the ratings out when the type says so", () => {
  const input = noteInputFor(place, [{ ...dog, noteShowsRatings: false }, baby], "dog");
  assert.deepEqual(input.types, [{ emoji: "🐕", score: 4.5, ratings: undefined }]);
});

test("a list note for a type the place does not have is empty", () => {
  const onlyDog = { ...place, typeIds: ["dog"] };
  assert.deepEqual(noteInputFor(onlyDog, [dog, baby], "baby"), { types: [], lastVisitAt: 123 });
  assert.deepEqual(noteInputFor(place, [dog, baby], "gone"), { types: [], lastVisitAt: 123 });
});

test("a Google Maps list is matched to the type with that list name", () => {
  const types = [
    { id: "dog", listName: "Dog parks" },
    { id: "baby", listName: "Baby park" },
  ];
  assert.equal(typeForListTitle("Dog parks", types)?.id, "dog");
  assert.equal(typeForListTitle("dog Parks 🐕", types)?.id, "dog");
  assert.equal(typeForListTitle("Baby parks", types), null);
  assert.equal(typeForListTitle("", types), null);
});
