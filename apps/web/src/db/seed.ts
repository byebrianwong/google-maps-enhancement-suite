import { db } from "./index";
import { criteria, placeTypes, settings } from "./schema";

// Idempotent. Inserts the two starter place types and their criteria if
// missing, and default settings. Never overwrites user edits.
export async function seed() {
  const types = [
    { id: "dog", name: "Dog park", emoji: "🐕", color: "#2f855a", sort: 0 },
    { id: "baby", name: "Baby park", emoji: "👶", color: "#d69e2e", sort: 1 },
  ];
  for (const t of types) {
    await db.insert(placeTypes).values(t).onConflictDoNothing();
  }

  const crits = [
    // Dog park
    ["dog", "dog-grass", "Grass quality", "Dirt and mud", "Lush and soft", 1, 0],
    ["dog", "dog-space", "Room to run", "Cramped", "Wide open", 1, 1],
    ["dog", "dog-crowd", "Crowd level", "Packed", "Quiet", 1, 2],
    ["dog", "dog-shade", "Shade", "Full sun", "Plenty of shade", 1, 3],
    ["dog", "dog-offleash", "Off-leash", "Leash only", "Fenced off-leash area", 1, 4],
    ["dog", "dog-water", "Water", "None", "Fountain and bowls", 0.75, 5],
    ["dog", "dog-clean", "Cleanliness", "Watch your step", "Spotless", 0.75, 6],
    // Baby park
    ["baby", "baby-paths", "Stroller paths", "Gravel and stairs", "Smooth and paved", 1, 0],
    ["baby", "baby-safe", "Feels safe", "Sketchy", "Very safe", 1, 1],
    ["baby", "baby-playground", "Playground", "None", "Great toddler area", 1, 2],
    ["baby", "baby-shade", "Shade", "Full sun", "Plenty of shade", 1, 3],
    ["baby", "baby-crowd", "Crowd level", "Packed", "Quiet", 0.75, 4],
    ["baby", "baby-facilities", "Bathrooms & changing", "None", "Clean, with changing table", 0.75, 5],
    ["baby", "baby-seating", "Seating", "Nowhere to sit", "Benches and picnic tables", 0.5, 6],
  ] as const;
  for (const [typeId, id, label, lowLabel, highLabel, weight, sort] of crits) {
    await db
      .insert(criteria)
      .values({ id, typeId, label, lowLabel, highLabel, weight, sort })
      .onConflictDoNothing();
  }

  const defaults: Record<string, string> = {
    defaultMode: "drive",
    defaultBudgetMinutes: "60",
    minStayMinutes: "20",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
}
