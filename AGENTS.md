# Notes for coding agents

Maps Enhancement Suite. The GitHub repo is `google-maps-enhancement-suite`;
the Chrome extension's display name is "Enhancement Suite for Google Maps".
In code, call the project "maps enhancement suite".

This is an npm workspaces monorepo. Run commands from the repo root.

- `apps/web`: Next.js 16 app (Park Picker). It has its own `AGENTS.md`
  about Next.js 16. Read it before changing anything in `apps/web`.
- `apps/extension`: Chrome extension (Manifest V3), bundled with esbuild.
  No framework.
- `packages/core`: plain TypeScript used by both apps, imported as
  `@repo/core`. Exported straight from source; there is no build step.

Rules:

- Put logic that both apps need in `packages/core`, with tests next to it
  (`*.test.ts`, run by `npm test`).
- The web app serves the extension at `/api/ext/*`. The request and
  response types live in `packages/core/src/api.ts`. Change both sides in
  the same commit.
- The note text format (`packages/core/src/note.ts`) is stored inside
  people's Google Maps notes. Changing it means old notes stop being
  recognised and get a second block added. Keep `splitNote` able to read
  the old format if you change it.
- Google Maps page structure is not a stable interface. The extension
  only reads the page URL and the field the person is typing in. Do not
  add code that depends on Google's class names.
- Before finishing: `npm run typecheck`, `npm test`, `npm run lint`, and
  for extension changes `npm run test:e2e`.
