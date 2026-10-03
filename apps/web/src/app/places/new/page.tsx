import type { Metadata } from "next";
import { AddPlace } from "@/components/AddPlace";
import { getOrigins, getTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a place" };

export default async function NewPlacePage() {
  const [types, origins] = await Promise.all([getTypes(), getOrigins()]);
  return <AddPlace types={types} origins={origins} />;
}
