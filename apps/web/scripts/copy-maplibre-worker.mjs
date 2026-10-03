// maplibre-gl 6 loads its web worker from a URL next to its own bundle,
// which does not survive bundling. We serve the worker (and the shared
// module it imports) from /public and point maplibre at it with
// setWorkerUrl() in MapView.tsx. Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log("Copied maplibre worker to public/maplibre/");
