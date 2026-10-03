// End-to-end test for the extension, on real Google Maps pages.
//
// It starts the web app on port 3100 with its own throwaway database (your
// real data is never touched), loads the built extension into Playwright's
// Chromium, and checks: settings popup, matching and linking a place,
// adding a new place, and filling a note field.
//
// Google Maps is used signed out, so there is no real list note to edit.
// The fill test uses a text box the test adds to the Google Maps page.
//
// Run with: npm run test:e2e  (from the repo root)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium } from "playwright-core";

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

  // 2. The web app on its own port.
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: webDir, env, stdio: ["ignore", "pipe", "pipe"] });
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

  // 3. Chromium with the extension. "--headless=new" keeps extensions working.
  ctx = await chromium.launchPersistentContext(path.join(work, "profile"), {
    executablePath: findChromium(),
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
    viewport: { width: 1280, height: 860 },
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
  await page.screenshot({ path: path.join(shots, "6-added.png") });

  // 8. Back to the first place: now matched by its stored link.
  await page.goto(DOLORES, { waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: "Fill note" }).waitFor({ timeout: 20_000 });
  check("a linked place is recognised on the next visit", true);

  // 9. Pages that are not a single place.
  await page.goto("https://www.google.com/maps/@37.7749,-122.4194,13z", { waitUntil: "domcontentloaded" });
  await panel.getByText("Open a place").waitFor({ timeout: 20_000 });
  check("shows a hint on map pages without a place", true);
} catch (err) {
  check("test run finished without errors", false, err.message);
} finally {
  await ctx?.close().catch(() => {});
  server?.kill("SIGTERM");
  // The browser profile is large and only useful during the run.
  rmSync(path.join(work, "profile"), { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
