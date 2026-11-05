import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { readPublishedUncached } from "./service";
import { legacyDefault } from "./schema";
import { initialPublishedAppearance } from "./initial";
export const APPEARANCE_TAG = "store-appearance-v1";
const storeScope = process.env.JETSELLER_STORE_PROFILE === "self-hosted" ? process.env.JETSELLER_INSTALLATION_ID ?? "unconfigured" : "legacy";
const cached = unstable_cache(readPublishedUncached, [APPEARANCE_TAG, storeScope], {
  tags: [APPEARANCE_TAG],
  revalidate: 60,
});
export const getPublishedAppearance = cache(async () => {
  try {
    return await cached();
  } catch {
    const config = initialPublishedAppearance();
    return { config, version: 0, legacy: JSON.stringify(config) === JSON.stringify(legacyDefault()) };
  }
});
