import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// A kind of place, e.g. "Dog park" or "Baby park". Each type owns its own
// rating criteria. Adding a new type is a data change, not a code change.
export const placeTypes = sqliteTable("place_types", {
  id: text("id").primaryKey(), // slug, e.g. "dog"
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(), // hex, used for map markers
  sort: integer("sort").notNull().default(0),
  // The matching list in Google Maps, e.g. "Dog parks". Only a label: the
  // extension shows it so you can pick which list you are filling notes in.
  googleListName: text("google_list_name"),
  // Whether a note for this type's list shows each rating below the score.
  noteShowsRatings: integer("note_shows_ratings", { mode: "boolean" }).notNull().default(true),
});

// One thing you rate about a place, scoped to a type. Rated 1 to 5.
export const criteria = sqliteTable("criteria", {
  id: text("id").primaryKey(),
  typeId: text("type_id")
    .notNull()
    .references(() => placeTypes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  lowLabel: text("low_label").notNull(), // what a 1 means
  highLabel: text("high_label").notNull(), // what a 5 means
  // How much this counts in the type's overall score. 0 means it is rated
  // and shown but left out of the score. See scoreForType in @repo/core.
  weight: real("weight").notNull().default(1),
  sort: integer("sort").notNull().default(0),
});

export const places = sqliteTable("places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address"),
  notes: text("notes"),
  source: text("source").notNull().default("manual"), // manual | photon | overpass | google
  osmId: text("osm_id"),
  // The matching place in Google Maps, set by the Chrome extension.
  // googleFid is Google's feature id ("0x...:0x..."); see @repo/core google.ts.
  googleFid: text("google_fid"),
  googleName: text("google_name"),
  googlePlaceId: text("google_place_id"), // Places API id ("ChIJ..."), when known
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

// Which types apply to a place. A park can be both a dog park and a baby park.
export const placeTypeTags = sqliteTable(
  "place_type_tags",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    typeId: text("type_id")
      .notNull()
      .references(() => placeTypes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.typeId] })],
);

// Current rating for one criterion on one place.
export const ratings = sqliteTable(
  "ratings",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => criteria.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // 1..5
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.criterionId] })],
);

export const visits = sqliteTable("visits", {
  id: text("id").primaryKey(),
  placeId: text("place_id")
    .notNull()
    .references(() => places.id, { onDelete: "cascade" }),
  typeId: text("type_id").references(() => placeTypes.id, {
    onDelete: "set null",
  }), // what you went for, if you said
  visitedAt: integer("visited_at", { mode: "timestamp_ms" }).notNull(),
  rating: integer("rating"), // optional 1..5 "how was it today"
  note: text("note"),
});

// Where trips start from. "Home" is the default.
export const origins = sqliteTable("origins", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🏠"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

// Cached one-way travel time from an origin to a place for a travel mode.
export const travelTimes = sqliteTable(
  "travel_times",
  {
    originId: text("origin_id")
      .notNull()
      .references(() => origins.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(), // drive | walk | bike
    seconds: integer("seconds").notNull(),
    meters: integer("meters").notNull(),
    provider: text("provider").notNull(),
    computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.originId, t.placeId, t.mode] })],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type PlaceType = typeof placeTypes.$inferSelect;
export type Criterion = typeof criteria.$inferSelect;
export type Place = typeof places.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type Origin = typeof origins.$inferSelect;
export type TravelTime = typeof travelTimes.$inferSelect;
