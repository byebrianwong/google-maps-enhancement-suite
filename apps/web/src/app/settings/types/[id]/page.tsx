import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TypeEditorShell } from "@/components/TypeEditor";
import { getPlaces, getRatingCounts, getTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/settings/types/[id]">): Promise<Metadata> {
  const { id } = await params;
  const type = (await getTypes()).find((t) => t.id === id);
  return { title: type ? `${type.name} settings` : "Place type" };
}

export default async function TypeSettingsPage({ params }: PageProps<"/settings/types/[id]">) {
  const { id } = await params;
  const types = await getTypes();
  const type = types.find((t) => t.id === id);
  if (!type) notFound();
  const [places, ratingCounts] = await Promise.all([getPlaces(types), getRatingCounts()]);
  const tagged = places
    .filter((p) => p.typeIds.includes(id))
    .map((p) => ({ id: p.id, name: p.name, ratingMap: p.ratingMap, lastVisitAt: p.lastVisitAt }));
  return <TypeEditorShell type={type} places={tagged} ratingCounts={ratingCounts} />;
}
