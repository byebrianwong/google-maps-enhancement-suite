# Maps Enhancement Suite

Personal additions to Google Maps. The Chrome extension is called
**Enhancement Suite for Google Maps**. One repository holds every piece:

| Folder | What it is |
| --- | --- |
| `apps/web` | **Park Picker**, a web app for rating parks and picking one to go to right now. Installs on a phone as a home-screen app. |
| `apps/extension` | A **Chrome extension** that shows your Park Picker ratings on Google Maps and fills them into the notes on your Google Maps lists as moons. |
| `packages/core` | Code both of them use: scoring, moon ratings, the note text, reading Google Maps links, matching places. |

Google Maps has no way for other apps to edit your saved lists. The
extension works around that by running inside your own signed-in Chrome.
It only fills the note field you are editing; you still press Done in
Google Maps yourself.

## Run it

```bash
npm install
npm run dev
```

The web app runs at http://localhost:3000. See `apps/web/README.md`.

Build the extension, then load `apps/extension/dist` in Chrome:

```bash
npm run build:extension
```

See `apps/extension/README.md` for the steps.

## Commands

Run these from this folder.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app |
| `npm run build` | Production build of the web app |
| `npm run dev:extension` | Rebuild the extension on every change |
| `npm run build:extension` | Build the extension into `apps/extension/dist` |
| `npm test` | Unit tests (shared code) |
| `npm run test:e2e` | Load the extension in Chromium and test it on real Google Maps pages |
| `npm run typecheck` | Type-check every package |
| `npm run lint` | Lint the web app |

## How the pieces share code

This is an npm workspaces monorepo. `packages/core` is never published.
npm links it into `node_modules/@repo/core`, and both apps import it as
`@repo/core`. A change to it reaches both apps on their next build.

The `@repo/` prefix is only a local name. It does not need to change if
the repository is renamed.

## Deploying

Deploy `apps/web` (for example on Vercel, with the project's Root
Directory set to `apps/web`). See `apps/web/README.md` for the database
settings. Then put the deployed URL in the extension's settings.
