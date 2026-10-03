// Builds the extension into dist/. Load that folder with "Load unpacked"
// in chrome://extensions. With --watch it rebuilds on every change; reload
// the extension in chrome://extensions to pick changes up.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

function copyStatic() {
  const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
  manifest.version = pkg.version;
  writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));
  cpSync("src/popup.html", "dist/popup.html");
  cpSync("src/popup.css", "dist/popup.css");
  cpSync("src/icons", "dist/icons", { recursive: true });
}

const ctx = await esbuild.context({
  entryPoints: { background: "src/background.ts", content: "src/content.ts", popup: "src/popup.ts" },
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static-files", setup: (b) => b.onEnd(copyStatic) }],
});

if (watch) {
  await ctx.watch();
  console.log("Watching for changes. Reload the extension in chrome://extensions to see them.");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
