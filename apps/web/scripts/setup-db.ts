import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import { db } from "../src/db";
import { seed } from "../src/db/seed";

async function main() {
  mkdirSync("data", { recursive: true });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed();
  console.log("Database ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
