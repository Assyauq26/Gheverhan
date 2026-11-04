import { getPublishedAppearance } from "@/modules/appearance/published";
import { AppearanceProvider, StoreLogo } from "@/components/appearance/context";
export async function StoreWordmark() {
 const { config } = await getPublishedAppearance();
 return <AppearanceProvider config={config}><StoreLogo /></AppearanceProvider>;
}
