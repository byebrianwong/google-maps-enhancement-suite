import type { Metadata } from "next";
import { SettingsPanel } from "@/components/SettingsPanel";
import { getOrCreateExtensionToken } from "@/lib/extension";
import { getOrigins, getSettings, getTypes } from "@/lib/queries";
import { providerLabel } from "@/lib/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [origins, settings, types, extensionToken] = await Promise.all([
    getOrigins(),
    getSettings(),
    getTypes(),
    getOrCreateExtensionToken(),
  ]);
  return (
    <SettingsPanel
      origins={origins}
      settings={settings}
      types={types}
      providerLabel={providerLabel()}
      extensionToken={extensionToken}
    />
  );
}
