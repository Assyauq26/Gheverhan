import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { makeDefault, legacyDefault, TOKEN_KEYS, parseAppearance } from "@/modules/appearance/schema";
import { contrastErrors } from "@/modules/appearance/contrast";
import { themeStyle, isLegacy } from "@/modules/appearance/runtime";
it("keeps the exact pre-rebrand legacy revision for rollback", () => {
 expect(createHash("sha256").update(JSON.stringify(legacyDefault())).digest("hex")).toBe("eb10463877f5f7e681610f9fdc696ed76395df6f79ed2597823890c86287b405");
 expect(themeStyle(legacyDefault())).toEqual({});
});
it("JetSeller draft preserves schema/tokens and passes all contrast checks", () => {
 const v=makeDefault();
 expect(v.identity.name).toBe("JetSeller"); expect(v.identity.logoAssetId).toBeNull();
 expect(v.colors.primary).toBe("#E1251B"); expect(v.colors.text).toBe("#111418");
 expect(Object.keys(v.colors)).toHaveLength(TOKEN_KEYS.length);
 expect(contrastErrors(v)).toEqual([]); expect(isLegacy(v)).toBe(false);
 expect(themeStyle(v)).toHaveProperty("--store-primary", "#E1251B");
});
it("parsing an existing published identity never silently rebrands it", () => {
 const v=legacyDefault();v.identity.name="Custom Store";
 expect(parseAppearance(v).identity.name).toBe("Custom Store");
});
