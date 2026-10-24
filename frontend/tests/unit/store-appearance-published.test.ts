import { it, expect, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/modules/appearance/service", () => ({
  readPublishedUncached: read,
}));
import { getPublishedAppearance } from "@/modules/appearance/published";
import { legacyDefault } from "@/modules/appearance/schema";
it("public DB failure uses safe legacy config and exposes no draft or error", async () => {
  read.mockRejectedValue(new Error("private-database-detail"));
  expect(await getPublishedAppearance()).toEqual({
    config: legacyDefault(),
    version: 0,
    legacy: true,
  });
});
it("published DTO contains only the published configuration", async () => {
  const value = { config: legacyDefault(), version: 7, legacy: false };
  read.mockResolvedValue(value);
  expect(await getPublishedAppearance()).toEqual(value);
});
