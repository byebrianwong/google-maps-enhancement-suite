# Enhancement Suite for Google Maps (Chrome extension)

The Chrome extension of Maps Enhancement Suite. Its first feature is Park
Picker: it shows your rating for the place open in Google Maps, and fills
it into that place's note in your Google Maps lists:

```
🐕 🌕🌕🌕🌕🌗 4.5
👶 🌕🌕🌕🌑🌑 3.0
🌙 Park Picker · last visit Sep 25
Your own note stays here, below the moons.
```

In one type's list, for example your "Dog parks" list, the note can show
that type's score and each rating instead:

```
🐕 🌕🌕🌕🌕🌗 4.5
Grass quality 5/5 · Room to run 4/5
🌙 Park Picker · last visit Sep 25
```

What you rate, and how much each rating counts, is set per type in the web
app: Settings, then the type.

## Install

1. From the repo root: `npm run build:extension`.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose `apps/extension/dist`.
4. Click the extension's icon. Paste the **App URL** and **Token** from the
   web app's Settings page, then press **Save and test**.

After changing the code, run the build again and press the reload arrow on
the extension's card in `chrome://extensions`. `npm run dev:extension`
rebuilds on every save.

## Use

1. Open one of your lists in Google Maps on a computer, and click a place.
2. The panel at the top right finds the matching place in Park Picker.
   - **Link** connects them, the first time only. After that the match uses
     Google's place id.
   - If the place is not in Park Picker, **Add to Park Picker** saves it.
3. Under **Note for**, pick the list you are working in: **All types**, or
   one type's list (named in the web app's type settings). The panel
   shows the exact note it will write. The choice is remembered, because
   you usually go through one list at a time. Google Maps does not show
   which list you are in on the page, so the extension cannot pick it for
   you.
4. Click into the place's note in your list. Press **Fill note**, or
   **Alt+Shift+M** (change it at `chrome://extensions/shortcuts`).
5. Press Done in Google Maps to save the note.

Filling again replaces only the moons block at the top. Anything you wrote
below it is kept. The panel refuses to fill Google's search box.

## How it works

- `src/content.ts` runs on `www.google.com/maps`. It reads the place from
  the page URL (name, location and Google's feature id), matches it to your
  saved places, and draws the panel in a shadow root so Google's styles
  don't affect it.
- `src/background.ts` makes every request to the web app (`/api/ext/*`)
  with your token. Requests from the content script would count as coming
  from google.com.
- `src/popup.ts` is the settings page. Addresses other than localhost ask
  for Chrome's permission first.
- Shared logic (URL parsing, matching, the note format) is in
  `packages/core` and has unit tests there.

The extension does not click through Google Maps by itself. Google's page
structure changes without notice, so the extension depends only on the
page URL and on the text field you are typing in.

## Limits

- Desktop Chrome only. Chrome on phones does not run extensions. On a
  phone, use **Copy note** on the place page in the web app and paste it
  into Google Maps.
- Only `www.google.com/maps` is covered, not country domains such as
  `google.co.uk`.
- Not yet tried on a signed-in Google Maps list. The automated test fills a
  text box it adds to a Google Maps page, because the real note field only
  exists when signed in.

## Test

```bash
npm run test:e2e
```

This starts the web app on port 3100 with a throwaway database, loads the
extension into Playwright's Chromium, and checks linking, adding, filling
(for all types and for one type's list) and the settings popup on real
Google Maps pages. It can run while
`npm run dev` is running: the test server builds into `apps/web/.next-e2e`.
If no Chromium is found, run `npx playwright-core install chromium`.
