import type { Metadata } from "next";
import { PlacesList } from "@/components/PlacesList";
import { getPlaces, getTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Places" };

export default async function PlacesPage() {
  const types = await getTypes();
  const places = await getPlaces(types);
  return <PlacesList places={places} types={types} />;
}
