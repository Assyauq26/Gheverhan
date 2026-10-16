// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/components/ui/navigation", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => React.createElement("img", { alt }),
}));
vi.mock("@/components/storefront/wishlist-button", () => ({
  WishlistButton: () => React.createElement("button", { type: "button", "aria-label": "Wishlist" }, "Wishlist"),
}));
vi.mock("@/components/storefront/quick-add-button", () => ({
  QuickAddButton: () => React.createElement("button", { type: "button", "aria-label": "Tambah" }, "Tambah"),
}));

import { ProductCard } from "@/components/storefront/product-card";

describe("ProductCard interactive HTML invariants", () => {
  it("renders wishlist control next to the image link, never nested in an anchor", () => {
    const view = render(React.createElement(ProductCard, {
      product: { id: "p1", slug: "shirt", name: "Shirt", image: null, basePrice: 100_000,
        salePrice: null, ratingAvg: 0, reviewCount: 0, variantId: "v1" },
    }));
    const document = view.container;
    const wishlist = document.querySelector('button[aria-label="Wishlist"]');
    expect(wishlist).not.toBeNull();
    expect(wishlist?.closest("a")).toBeNull();
    expect(document.querySelector('a[href="/product/shirt"]')).not.toBeNull();
    expect(document.querySelector("a button")).toBeNull();
    expect(document.querySelector('button[aria-label="Tambah"]')).not.toBeNull();
    cleanup();
  });
});
