import { GoNow } from "@/components/GoNow";
import { getOrigins, getPlaces, getSettings, getTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const types = await getTypes();
  const [places, origins, settings] = await Promise.all([getPlaces(types), getOrigins(), getSettings()]);
  return <GoNow places={places} types={types} origins={origins} settings={settings} />;
}
