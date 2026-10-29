// End-to-end test for the extension, on real Google Maps pages.
//
// It starts the web app on port 3100 with its own throwaway database (your
// real data is never touched), loads the built extension into Playwright's
// Chromium, and checks: settings popup, matching and linking a place,
// adding a new place, filling a note field, for all types and for one
// type's Google Maps list, and updating every note in a list at once.
//
// Google Maps is used signed out, so there is no real list note to edit.
// The fill test uses a text box the test adds to the Google Maps page. The
// list tests use stand-in list pages served at Google Maps addresses (see
// fake-list.mjs), because a real saved list needs a signed-in account.
//
// Run with: npm run test:e2e  (from the repo root)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium } from "playwright-core";
import { fakeListPage } from "./fake-list.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(here, "..");
const distDir = path.join(extDir, "dist");
const webDir = path.resolve(extDir, "../web");
const work = path.join(extDir, ".e2e");
const shots = process.env.E2E_SHOTS ?? path.join(work, "shots");
const PORT = 3100;
const APP = `http://localhost:${PORT}`;
const dbFile = path.join(work, "e2e.db");
const TOKEN = "e2e-test-token";
// NEXT_DIST_DIR gives this server its own build folder, so it can run while
// `npm run dev` is running (Next.js allows one dev server per build folder).
const env = { ...process.env, DATABASE_URL: `file:${dbFile}`, NEXT_DIST_DIR: ".next-e2e", NODE_ENV: "development" };

// Real Google Maps URLs, copied 2026-10-03.
const DOLORES =
  "https://www.google.com/maps/place/Mission+Dolores+Park/@37.7602015,-122.4267959,17z/data=!3m1!4b1!4m6!3m5!1s0x808f7e1779aa70a7:0xa618e4eff1228d60!8m2!3d37.7602015!4d-122.4267959!16zL20vMDN6eXNz";
const DOLORES_FID = "0x808f7e1779aa70a7:0xa618e4eff1228d60";
const CORONA =
  "https://www.google.com/maps/place/Corona+Heights+Dog+Run/@37.7653491,-122.4401825,17z/data=!3m1!4b1!4m6!3m5!1s0x808f7e020f206785:0xa8ba1cd74c4aefb2!8m2!3d37.7653491!4d-122.4401825!16s%2Fg%2F11fx9gv98t";
const CORONA_FID = "0x808f7e020f206785:0xa8ba1cd74c4aefb2";

// Stand-in places for the list pages. Each opens at a Google Maps place
// address in Google's format, with a made-up feature id.
const placeUrl = (name, fid, lat, lng) =>
  `https://www.google.com/maps/place/${name.replace(/ /g, "+")}/@${lat},${lng},17z/data=!3m1!4b1!4m6!3m5!1s${fid}!8m2!3d${lat}!4d${lng}!16s`;
const ALAMO_FID = "0x808f80a6a1d4b6a9:0x1d4b6a9e2e0a1a01";
const DUBOCE_FID = "0x808f7e2000000002:0xd0b0c";
const LAFAYETTE_FID = "0x808580c000000003:0xfa1e";
const ALAMO = placeUrl("Alamo Square", ALAMO_FID, 37.776357, -122.434694);
const DUBOCE = placeUrl("Duboce Park", DUBOCE_FID, 37.769, -122.4334);
const LAFAYETTE = placeUrl("Lafayette Park", LAFAYETTE_FID, 37.7916, -122.4277);
const GOLDEN_GATE = placeUrl("Golden Gate Park", "0x80858700000000a4:0x66a7", 37.7694, -122.4862);
const DOG_LIST_URL = "https://www.google.com/maps/@37.77,-122.44,13z/data=!4m3!11m2!2sE2eDogParks!3e3";
const BABY_LIST_URL = "https://www.google.com/maps/@37.78,-122.43,13z/data=!4m3!11m2!2sE2eBabyPark!3e3";
const FAKE_LISTS = {
  E2eDogParks: {
    id: "E2eDogParks",
    title: "Dog parks",
    variant: "inline",
    items: [
      { name: "Mission Dolores Park", url: DOLORES, note: "Bring water." },
      { name: "Corona Heights Dog Run", url: CORONA },
      { name: "Alamo Square", url: ALAMO },
      { name: "Golden Gate Park", url: GOLDEN_GATE },
      { name: "Duboce Park", url: DUBOCE },
    ],
  },
  E2eBabyPark: {
    id: "E2eBabyPark",
    title: "Baby park",
    variant: "button",
    items: [
      { name: "Mission Dolores Park", url: DOLORES },
      { name: "Lafayette Park", url: LAFAYETTE, note: "Shady benches by the playground." },
      { name: "Duboce Park", url: DUBOCE },
    ],
  },
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` (${detail})` : ""}`);
}

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {}
  // Fall back to the newest Chromium Playwright has downloaded before.
  const cache = path.join(homedir(), "Library/Caches/ms-playwright");
  const dirs = existsSync(cache)
    ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const d of dirs) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac", "chrome-mac-x64"]) {
      const p = path.join(cache, d, arch, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("No Chromium found. Run: npx playwright-core install chromium");
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start`);
}

async function placeRow(db, where, args) {
  const r = await db.execute({ sql: `select id, name, google_fid, source from places where ${where}`, args });
  return r.rows[0] ?? null;
}

let server;
let ctx;
try {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(shots, { recursive: true });

  // 1. A fresh database with the seeded types, then test data.
  await run("npm", ["run", "setup"], { cwd: webDir, env });
  const db = createClient({ url: `file:${dbFile}` });
  await db.execute({ sql: "insert into settings(key, value) values ('extensionToken', ?)", args: [TOKEN] });
  await db.execute("update place_types set google_list_name = 'Dog parks' where id = 'dog'");
  const now = Date.now();
  const visitAt = Date.UTC(2026, 8, 25, 18, 0);
  await db.execute({
    sql: "insert into places (id, name, lat, lng, source, created_at, updated_at) values ('p-dolores', 'Dolores Park', 37.7596, -122.4269, 'manual', ?, ?)",
    args: [now, now],
  });
  await db.execute("insert into place_type_tags (place_id, type_id) values ('p-dolores', 'dog'), ('p-dolores', 'baby')");
  for (const [criterion, value] of [["dog-grass", 5], ["dog-space", 4], ["baby-paths", 3]]) {
    await db.execute({
      sql: "insert into ratings (place_id, criterion_id, value, updated_at) values ('p-dolores', ?, ?, ?)",
      args: [criterion, value, now],
    });
  }
  await db.execute({
    sql: "insert into visits (id, place_id, type_id, visited_at) values ('v1', 'p-dolores', 'dog', ?)",
    args: [visitAt],
  });
  const visitLabel = new Date(visitAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const expectedBlock = `🐕 🌕🌕🌕🌕🌗 4.5\n👶 🌕🌕🌕🌑🌑 3.0\n🌙 Park Picker · last visit ${visitLabel}`;
  const dogListBlock = `🐕 🌕🌕🌕🌕🌗 4.5\nGrass quality 5/5 · Room to run 4/5\n🌙 Park Picker · last visit ${visitLabel}`;

  // 2. The web app on its own port.
  // In its own process group, so stopping it also stops the Next.js server
  // that npx starts.
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: webDir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  server.on("exit", (code) => {
    if (code) console.error(`web app exited ${code}:\n${serverLog}`);
  });
  await waitForServer(`${APP}/api/ext/places`, 90_000);
  const denied = await fetch(`${APP}/api/ext/places`);
  check("API refuses requests without the token", denied.status === 401, `HTTP ${denied.status}`);
  const allowed = await fetch(`${APP}/api/ext/places`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  check("API answers with the token", allowed.status === 200, `HTTP ${allowed.status}`);
  const apiBody = await allowed.json();
  const apiDog = apiBody.types.find((t) => t.id === "dog");
  check(
    "API sends each type's list name, criteria and the place's ratings",
    apiDog?.listName === "Dog parks" && apiDog?.criteria.length === 7 && apiBody.places[0]?.ratings["dog-grass"] === 5,
  );

  // 3. Chromium with the extension. "--headless=new" keeps extensions working.
  ctx = await chromium.launchPersistentContext(path.join(work, "profile"), {
    executablePath: findChromium(),
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
    viewport: { width: 1280, height: 860 },
    // Google Maps installs a service worker, and pages it serves skip
    // ctx.route(), so the stand-in list pages would never load. The
    // extension's own worker is not affected.
    serviceWorkers: "block",
  });
  await ctx.route(/!2sE2e\w+/, (route) => {
    const id = /!2s(E2e\w+)/.exec(route.request().url())[1];
    return route.fulfill({ contentType: "text/html", body: fakeListPage(FAKE_LISTS[id]) });
  });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
  const extId = new URL(worker.url()).host;
  check("extension loads", !!extId, extId);

  // 4. Settings popup.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.fill("#appUrl", APP);
  await popup.fill("#token", TOKEN);
  await popup.click("#save");
  await popup.waitForFunction(() => /Connected|Can't|Wrong|No token/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 15_000 });
  const popupStatus = await popup.textContent("#status");
  check("popup connects to the app", popupStatus?.startsWith("Connected. 1 place,") ?? false, popupStatus ?? "");
  await popup.screenshot({ path: path.join(shots, "1-popup.png") });
  await popup.close();

  // 5. A place that is saved in the app under a different name.
  const page = await ctx.newPage();
  await page.goto(DOLORES, { waitUntil: "domcontentloaded" });
  const panel = page.locator("#maps-enhancement-suite .panel");
  await panel.getByText("Looks like").waitFor({ timeout: 20_000 });
  check("matches Mission Dolores Park to the saved Dolores Park", (await panel.innerText()).includes("Dolores Park"));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "2-likely-match.png") });

  await panel.getByRole("button", { name: "Link", exact: true }).click();
  await panel.getByRole("button", { name: "Fill note" }).waitFor({ timeout: 10_000 });
  const linked = await placeRow(db, "id = 'p-dolores'", []);
  check("Link stores Google's place id", linked?.google_fid === DOLORES_FID, String(linked?.google_fid));
  check("panel shows moons", (await panel.innerText()).includes("🌕🌕🌕🌕🌗"));
  await page.screenshot({ path: path.join(shots, "3-linked.png") });

  // 6. Fill a note field. Google's real note field needs a signed-in list,
  //    so the test adds a text box to the Google Maps page instead.
  await page.evaluate(() => {
    const t = document.createElement("textarea");
    t.id = "e2e-note";
    t.value = "Park on 18th St.";
    t.style.cssText = "position:fixed;left:24px;bottom:24px;z-index:2147483001;width:420px;height:110px;font:14px system-ui";
    document.body.append(t);
    t.focus();
  });
  await panel.getByRole("button", { name: "Fill note" }).click();
  const filled = await page.inputValue("#e2e-note");
  check("Fill writes the moons above the person's own text", filled === `${expectedBlock}\nPark on 18th St.`, JSON.stringify(filled));
  const stillFocused = await page.evaluate(() => document.activeElement?.id === "e2e-note");
  check("clicking Fill keeps the cursor in the note field", stillFocused);
  await page.screenshot({ path: path.join(shots, "4-filled.png") });

  await panel.getByRole("button", { name: "Fill note" }).click();
  check("filling twice changes nothing", (await page.inputValue("#e2e-note")) === filled);
  check("and says the note is up to date", (await panel.innerText()).includes("already up to date"));

  // The keyboard shortcut arrives through the background worker.
  await page.evaluate(() => {
    const t = document.getElementById("e2e-note");
    t.value = "only my text";
    t.focus();
  });
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.google.com/maps/*" });
    await chrome.tabs.sendMessage(tab.id, { type: "fill-note" });
  });
  await page.waitForFunction(() => document.getElementById("e2e-note").value.startsWith("🐕"));
  check("the shortcut's message fills the note", (await page.inputValue("#e2e-note")) === `${expectedBlock}\nonly my text`);

  // 6b. The note for one type's list: that type's score and its ratings.
  await panel.getByRole("button", { name: "🐕 Dog parks" }).click();
  check("the preview shows the Dog parks note", (await panel.locator("pre.note").innerText()) === dogListBlock);
  await page.focus("#e2e-note"); // it holds the all-types note and "only my text"
  await panel.getByRole("button", { name: "Fill note" }).click();
  check(
    "Fill for the Dog parks list replaces the block and keeps the person's text",
    (await page.inputValue("#e2e-note")) === `${dogListBlock}\nonly my text`,
    JSON.stringify(await page.inputValue("#e2e-note")),
  );
  await page.screenshot({ path: path.join(shots, "4b-dog-list.png") });
  await page.reload({ waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: "Fill note" }).waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    () => document.getElementById("maps-enhancement-suite")?.shadowRoot?.querySelector('button.chip[aria-pressed="true"]')?.textContent === "🐕 Dog parks",
    null,
    { timeout: 5_000 },
  ).catch(() => {});
  check(
    "the chosen list is remembered after a reload",
    (await panel.locator('button.chip[aria-pressed="true"]').innerText()) === "🐕 Dog parks",
  );
  await panel.getByRole("button", { name: "All types" }).click();

  // It must not write into Google's search box.
  await page.locator('input[name="q"]').first().focus();
  const before = await page.locator('input[name="q"]').first().inputValue();
  await panel.getByRole("button", { name: "Fill note" }).click();
  const after = await page.locator('input[name="q"]').first().inputValue();
  check("refuses to fill the search box", before === after && (await panel.innerText()).includes("search box"));

  // 7. A place that is not in the app yet.
  await page.goto(CORONA, { waitUntil: "domcontentloaded" });
  await panel.getByText("isn't in Park Picker yet").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "5-not-saved.png") });
  await panel.getByRole("button", { name: "👶 Baby park" }).click(); // leave only Dog park selected
  await panel.getByRole("button", { name: "Add to Park Picker" }).click();
  await panel.getByRole("button", { name: "Fill note" }).waitFor({ timeout: 10_000 });
  const created = await placeRow(db, "google_fid = ?", [CORONA_FID]);
  check("Add creates the place, linked to Google", created?.name === "Corona Heights Dog Run" && created?.source === "google");
  const tags = await db.execute({ sql: "select type_id from place_type_tags where place_id = ?", args: [created?.id ?? ""] });
  check("Add uses the chosen types", tags.rows.map((r) => r.type_id).join(",") === "dog", tags.rows.map((r) => r.type_id).join(","));
  await panel.getByRole("button", { name: "👶 Baby park" }).click();
  check("a list for a type the place doesn't have says so", (await panel.innerText()).includes("isn't a Baby park in Park Picker"));
  await panel.getByRole("button", { name: "All types" }).click();
  await page.screenshot({ path: path.join(shots, "6-added.png") });

  // 8. Back to the first place: now matched by its stored link.
  await page.goto(DOLORES, { waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: "Fill note" }).waitFor({ timeout: 20_000 });
  check("a linked place is recognised on the next visit", true);

  // 9. Pages that are not a single place.
  await page.goto("https://www.google.com/maps/@37.7749,-122.4194,13z", { waitUntil: "domcontentloaded" });
  await panel.getByText("Open one of your lists").waitFor({ timeout: 20_000 });
  check("shows a hint on map pages without a place", true);

  // 10. Update every note in a list at once. Three more places in the app,
  //     not linked to Google yet: two match places in the lists by name.
  for (const [id, name, lat, lng, types, ratings] of [
    ["p-alamo", "Alamo Square Park", 37.7764, -122.4346, ["dog"], [["dog-grass", 4], ["dog-space", 5]]],
    ["p-duboce", "Duboce Park", 37.7692, -122.4337, ["baby"], [["baby-playground", 4]]],
    ["p-lafayette", "Lafayette Park", 37.7915, -122.4276, ["baby"], [["baby-paths", 5]]],
  ]) {
    await db.execute({
      sql: "insert into places (id, name, lat, lng, source, created_at, updated_at) values (?, ?, ?, ?, 'manual', ?, ?)",
      args: [id, name, lat, lng, now, now],
    });
    for (const t of types) await db.execute({ sql: "insert into place_type_tags (place_id, type_id) values (?, ?)", args: [id, t] });
    for (const [c, v] of ratings) {
      await db.execute({ sql: "insert into ratings (place_id, criterion_id, value, updated_at) values (?, ?, ?, ?)", args: [id, c, v, now] });
    }
  }
  const fakeNotes = (id) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), `fakeList:${id}`);
  const fakeSaves = (id) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]").length, `fakeListSaves:${id}`);
  const summaryOf = (p, list) =>
    p.locator("#maps-enhancement-suite .panel .summary").filter({ hasText: `${list} ·` }).first();

  await page.goto(DOG_LIST_URL, { waitUntil: "domcontentloaded" });
  const updateButton = panel.getByRole("button", { name: "Update all notes in this list" });
  await updateButton.waitFor({ timeout: 20_000 });
  check("finds the list on the page", (await panel.innerText()).includes("📋 Dog parks"));
  await page.waitForFunction(
    () => document.getElementById("maps-enhancement-suite")?.shadowRoot?.querySelector('button.chip[aria-pressed="true"]')?.textContent === "🐕 Dog parks",
    null,
    { timeout: 5_000 },
  ).catch(() => {});
  check(
    "picks the type whose list name matches the list",
    (await panel.locator('button.chip[aria-pressed="true"]').innerText()) === "🐕 Dog parks",
  );
  await page.screenshot({ path: path.join(shots, "7-list.png") });
  await updateButton.click();
  await summaryOf(page, "Dog parks").waitFor({ timeout: 90_000 });
  const dogSummary = await summaryOf(page, "Dog parks").innerText();
  await page.screenshot({ path: path.join(shots, "8-list-updated.png") });
  const dogNotes = await fakeNotes("E2eDogParks");
  check(
    "fills each note and keeps the person's own text",
    dogNotes["Mission Dolores Park"] === `${dogListBlock}\nBring water.`,
    JSON.stringify(dogNotes["Mission Dolores Park"]),
  );
  check("an unrated place says so", dogNotes["Corona Heights Dog Run"] === "🌙 Park Picker · not rated yet", JSON.stringify(dogNotes["Corona Heights Dog Run"]));
  check("a place loaded by scrolling the list is updated too", "Duboce Park" in dogNotes);
  check("a place not in the app is left alone", !("Golden Gate Park" in dogNotes));
  const alamo = await placeRow(db, "id = 'p-alamo'", []);
  check("a clear match is linked on the way", alamo?.google_fid === ALAMO_FID, String(alamo?.google_fid));
  check("and its note filled", dogNotes["Alamo Square"]?.startsWith("🐕 🌕") ?? false, JSON.stringify(dogNotes["Alamo Square"]));
  check(
    "the summary counts updated, linked and skipped places",
    /4 updated, 1 skipped/.test(dogSummary) && dogSummary.includes("Golden Gate Park: not in Park Picker") && dogSummary.includes("Linked to the app: Alamo Square, Duboce Park"),
    dogSummary.replace(/\n/g, " | "),
  );
  const savesBefore = await fakeSaves("E2eDogParks");
  await panel.getByRole("button", { name: "Update again" }).click();
  await page.waitForFunction(
    () => /already up to date/.test(document.getElementById("maps-enhancement-suite")?.shadowRoot?.querySelector(".summary")?.textContent ?? ""),
    null,
    { timeout: 90_000 },
  );
  check(
    "running it again changes nothing",
    (await fakeSaves("E2eDogParks")) === savesBefore && /4 already up to date/.test(await summaryOf(page, "Dog parks").innerText()),
  );
  const remembered = await worker.evaluate(async () => (await chrome.storage.local.get("lists")).lists);
  check("the list is remembered for Update all lists", remembered?.dog?.url === "https://www.google.com/maps/@37.77,-122.44,13z/data=!4m3!11m2!2sE2eDogParks!3e3");

  // 11. A list where each note is behind an "Add note" or "Edit note"
  //     button, and opening a place hides the list until Back is pressed.
  await page.goto(BABY_LIST_URL, { waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: "Update all notes in this list" }).click({ timeout: 20_000 });
  await summaryOf(page, "Baby park").waitFor({ timeout: 90_000 });
  const babySummary = await summaryOf(page, "Baby park").innerText();
  const babyNotes = await fakeNotes("E2eBabyPark");
  check(
    "fills notes behind Add note and Edit note buttons",
    babyNotes["Mission Dolores Park"]?.startsWith("👶 🌕🌕🌕🌑🌑 3.0\nStroller paths 3/5\n🌙 Park Picker") &&
      babyNotes["Lafayette Park"]?.startsWith("👶 🌕") &&
      babyNotes["Lafayette Park"]?.endsWith("\nShady benches by the playground.") &&
      babyNotes["Duboce Park"]?.startsWith("👶 🌕"),
    JSON.stringify(babyNotes),
  );
  check("comes back to the list after opening a place", /3 updated\./.test(babySummary) && babySummary.includes("Linked to the app: Lafayette Park"), babySummary.replace(/\n/g, " | "));
  await page.screenshot({ path: path.join(shots, "9-baby-list.png") });

  // 12. Update all lists, from the popup: each remembered list in turn.
  await page.evaluate(() => localStorage.removeItem("fakeList:E2eDogParks"));
  const popup2 = await ctx.newPage();
  await popup2.goto(`chrome-extension://${extId}/popup.html`);
  await popup2.locator("#lists li").first().waitFor({ timeout: 5_000 });
  check("the popup lists the remembered lists", (await popup2.locator("#lists").innerText()) === "Baby park\nDog parks");
  const runPage = ctx.waitForEvent("page");
  await popup2.click("#updateAll");
  const listTab = await runPage;
  // Baby park comes first, then the tab moves on to Dog parks, the last
  // list, which then shows how both went.
  await listTab.waitForURL(/E2eDogParks/, { timeout: 120_000 });
  await listTab.waitForFunction(
    () => document.getElementById("maps-enhancement-suite")?.shadowRoot?.querySelectorAll(".summary").length === 2,
    null,
    { timeout: 120_000 },
  );
  const allText = await listTab.locator("#maps-enhancement-suite .panel").innerText();
  check(
    "Update all lists goes through each list and sums them up",
    /Baby park · Done\. 3 already up to date\./.test(allText) && /Dog parks · Done\. 4 updated, 1 skipped\./.test(allText),
    allText.replace(/\n/g, " | "),
  );
  check("and fills the notes again", (await fakeNotes("E2eDogParks"))["Mission Dolores Park"] === `${dogListBlock}\nBring water.`);
  await listTab.screenshot({ path: path.join(shots, "10-all-lists.png") });
} catch (err) {
  check("test run finished without errors", false, err.message);
} finally {
  await ctx?.close().catch(() => {});
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  // The browser profile is large and only useful during the run.
  rmSync(path.join(work, "profile"), { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
