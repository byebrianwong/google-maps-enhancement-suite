import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The extension's end-to-end test runs a second copy of the app while
  // `npm run dev` may be running. Next.js allows only one dev server per
  // build folder, so the test sets NEXT_DIST_DIR to use its own.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
