# Park Picker

Rate places by what matters for a given kind of trip, and answer one question
fast: **"I have about an hour. Which park should I go to right now?"**

Built for two trips to start with, dog park and baby park, each with its own
checklist. You can add more types and criteria in Settings.

## What it does

- **Go** (home screen): pick a trip type, a starting point, a travel mode and a
  time budget. Every place shows one-way travel time, how long you would get
  there after going and coming back, its score, and when you last went.
  Places that do not fit are dimmed. "Go" logs a visit and opens directions in
  Google Maps.
- **Places**: everything you have saved, on a map and in a list, filterable by
  type.
- **Place detail**: rate each criterion 1 to 5, log visits with a note, see
  travel time from each starting point, move the pin, add notes.
- **Add**: search by name or address, "find parks near map center" using
  OpenStreetMap, or tap the map to drop a pin.
- **Settings**: starting points (Home, Work, ...), defaults, place types,
  travel-time provider, and the token for the Chrome extension.
- **Place type editor** (Settings, then a type): what you rate for that type,
  what a 1 and a 5 mean for each criterion, and how much each one counts in
  the overall score. A criterion can count 0 to 3 times; at 0 it is still
  rated and shown but left out of the score. The page previews the change on
  your own places, and the Google Maps note, before you save. Each type can
  name its Google Maps list (for example "Dog parks").
- **Google Maps note**: each place page shows the note the Chrome extension
  writes into your Google Maps lists, with a Copy button for doing it by
  hand on a phone. Pick "All types" for one line per type, or one type's
  list for that type's score with each rating below it.

It is a web app that installs to a phone home screen as a PWA. Same code on
desktop and mobile.

## Run it

From the repo root:

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` creates the SQLite database in
`apps/web/data/app.db`, runs migrations and seeds the two starter types.

On your phone, open the same URL on your local network (the dev server prints
it) and use "Add to Home Screen".

## Optional: better travel times

By default driving times come from the free OSRM demo router, and walking and
biking use a distance estimate. For traffic-aware times on all modes, put a
Google Maps Platform key with the **Routes API** enabled in `.env.local`:

```
GOOGLE_MAPS_API_KEY=...
```

See `.env.example`. Travel times are cached for 7 days per starting point,
place and mode. Settings has a button to clear the cache.

## External services (all free, no keys)

| Service | Used for |
| --- | --- |
| [OpenFreeMap](https://openfreemap.org) | Map tiles |
| [Photon](https://photon.komoot.io) | Place and address search |
| [Overpass API](https://overpass-api.de) | "Find parks near map center" |
| [OSRM demo](https://project-osrm.org) | Driving times when no Google key is set |

These are shared public servers with fair-use limits. Fine for personal use.

## Deploying

The app runs anywhere Next.js runs. On Vercel, set the project's Root
Directory to `apps/web`; Vercel installs the whole workspace from the repo
root. The database is SQLite through libsql, so for a hosted deploy create a
[Turso](https://turso.tech) database and set:

```
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=...
```

`npm run build` runs migrations against that database first. There is no
login: anyone with the URL can edit. Add auth before exposing it publicly.
The extension's API (`/api/ext/*`) does check a token, shown in Settings.

## Layout

```
src/db/             schema (Drizzle), client, seed
src/lib/            time helpers, routing providers, search clients
src/lib/actions.ts  server actions (all writes)
src/lib/queries.ts  reads
src/lib/extension.ts  token check for the Chrome extension's API
src/app/            pages and API routes
src/app/api/ext/    the API the Chrome extension calls
src/components/     screens and the shared MapView
scripts/            db setup, maplibre worker copy
```

Scoring, moon ratings and the Google Maps note format live in
`packages/core`, shared with the extension.

## Scripts

Run these inside `apps/web`, or from the root with `-w @repo/web`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Set up DB, start dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:studio` | Browse the database |
| `npm run typecheck` / `npm run lint` | Checks |
