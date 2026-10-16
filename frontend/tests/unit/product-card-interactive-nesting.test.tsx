// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a">) =>
    <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/wishlist/wishlist.actions", () => ({
  toggleWishlistAction: vi.fn(async () => ({ ok: true, data: { active: true } })),
}));
import { ProductCard } from "@/components/storefront/product-card";
afterEach(cleanup);
const product = {
  id: "fixture-1", slug: "kaos", name: "Kaos", image: null,
  basePrice: 100000, salePrice: null, ratingAvg: 0,
  reviewCount: 0, variantId: "variant-1",
};
describe("product-card interactive nesting", () => {
  it("renders wishlist button as a sibling, never a descendant, of the product anchor", () => {
    render(<ProductCard product={product} />);
    const wishlist = screen.getByRole("button", { name: "Tambah ke wishlist" });
    expect(wishlist.closest("a")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Kaos/i }).length).toBeGreaterThan(0);
    const article = wishlist.closest("article");
    expect(article).not.toBeNull();
    expect(article?.querySelector("a button")).toBeNull();
  });
  it("does not render wishlist button for featured cards", () => {
    render(<ProductCard product={product} featured />);
    expect(screen.queryByRole("button", { name: "Tambah ke wishlist" })).toBeNull();
  });
});
