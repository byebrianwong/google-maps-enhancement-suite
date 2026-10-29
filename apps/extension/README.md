# Enhancement Suite for Google Maps (Chrome extension)

The Chrome extension of Maps Enhancement Suite. Its first feature is Park
Picker: it shows your rating for the place open in Google Maps, and writes
your ratings into the notes in your Google Maps lists, a whole list at a
time:

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

### Update a whole list

1. Open one of your lists in Google Maps on a computer (Saved, then the
   list). The panel at the top right shows the list's name.
2. Under **Note for**, check which note to write. If the list's name is a
   type's Google Maps list name (set in the web app's type settings), that
   type is already picked.
3. Press **Update all notes in this list**. Keep the tab in front until
   it's done. Chrome slows down background tabs.

For each place in the list, the extension finds its place in Park Picker,
fills in the note and presses Done. A note that already says the same is
left alone, so running it again is quick. Places that aren't linked yet
are opened once to read Google's id for them. They are linked if the name
and location match as clearly as the panel's "Looks like…" suggestion.
Anything else is skipped and listed when it's done. **Stop** stops after
the place it is on.

### Update all your lists

The extension remembers each list you open whose name is a type's Google
Maps list name. Click the extension's icon and press **Update all lists**.
It opens a tab, goes through each of those lists in turn, and shows how
each went.

### One place by hand

1. Open a place in Google Maps.
2. The panel finds the matching place in Park Picker.
   - **Link** connects them, the first time only. After that the match uses
     Google's place id.
   - If the place is not in Park Picker, **Add to Park Picker** saves it.
3. Under **Note for**, pick the list you are working in. The panel shows the
   exact note it will write.
4. Click into the place's note in your list. Press **Fill note**, or
   **Alt+Shift+M** (change it at `chrome://extensions/shortcuts`).
5. Press Done in Google Maps to save the note.

Filling again replaces only the moons block at the top. Anything you wrote
below it is kept. The panel refuses to fill Google's search box.

## How it works

- `src/content.ts` runs on `www.google.com/maps` and draws the panel in a
  shadow root, so Google's styles don't affect it. It reads the open place
  from the page URL (name, location and Google's feature id) and matches it
  to your saved places.
- `src/bulk.ts` updates every note in the open list, one place at a time.
- `src/list-page.ts` is the only code that reads or clicks Google's list
  page. Google's class names change without notice, so it goes by what a
  screen reader sees: the side panel (`role="main"`), the place buttons, the
  note boxes or "Add note"/"Edit note" buttons after them, and the Done
  button. If Google changes the page, this is the file to fix.
- `src/background.ts` makes every request to the web app (`/api/ext/*`)
  with your token. Requests from the content script would count as coming
  from google.com. It also remembers your lists and runs **Update all
  lists**.
- `src/popup.ts` is the settings page. Addresses other than localhost ask
  for Chrome's permission first.
- Shared logic (URL parsing, matching, the note format) is in
  `packages/core` and has unit tests there.

## Limits

- Not yet tried on a signed-in Google Maps list. The list update was built
  and tested against stand-in list pages (`e2e/fake-list.mjs`), because the
  real note boxes only exist when signed in. If it can't find the notes, or
  skips places with a reason like "found no Done button", press **Copy page
  details** in the panel. It copies what the extension sees on the page
  (no class names or scripts) to paste into a bug report.
- It reads Google's English button labels ("Add note", "Edit note", "Done").
- Desktop Chrome only. Chrome on phones does not run extensions. On a
  phone, use **Copy note** on the place page in the web app and paste it
  into Google Maps.
- Only `www.google.com/maps` is covered, not country domains such as
  `google.co.uk`.

## Test

```bash
npm run test:e2e
```

This starts the web app on port 3100 with a throwaway database, loads the
extension into Playwright's Chromium, and checks linking, adding, filling
(for all types and for one type's list) and the settings popup on real
Google Maps pages. It then updates whole lists on stand-in list pages
served at Google Maps addresses: notes in text boxes and behind "Add note"
buttons, places that load as the list scrolls, linking on the way, a second
run that changes nothing, and **Update all lists**. It can run while
`npm run dev` is running: the test server builds into `apps/web/.next-e2e`.
If no Chromium is found, run `npx playwright-core install chromium`.
