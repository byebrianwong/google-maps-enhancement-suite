import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceDetail } from "@/components/PlaceDetail";
import { getOrigins, getPlace, getSettings, getTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/places/[id]">): Promise<Metadata> {
  const { id } = await params;
  const place = await getPlace(id);
  return { title: place?.name ?? "Place" };
}

export default async function PlacePage({ params }: PageProps<"/places/[id]">) {
  const { id } = await params;
  const [place, types, origins, settings] = await Promise.all([getPlace(id), getTypes(), getOrigins(), getSettings()]);
  if (!place) notFound();
  return <PlaceDetail place={place} types={types} origins={origins} settings={settings} />;
}
