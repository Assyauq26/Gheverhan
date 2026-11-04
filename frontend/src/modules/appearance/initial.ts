import { legacyDefault, makeDefault } from "./schema";

/** Used only when no saved merchant appearance exists. */
export function initialPublishedAppearance(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.JETSELLER_STORE_PROFILE !== "self-hosted") return legacyDefault();
  const config = makeDefault();
  const name = env.JETSELLER_STORE_DISPLAY_NAME;
  if (name && name === name.trim() && name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name)) config.identity.name = name;
  return config;
}
