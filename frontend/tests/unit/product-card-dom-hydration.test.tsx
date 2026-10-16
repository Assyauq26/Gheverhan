// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";

// Keep the test deterministic and avoid Next.js router/network dependencies.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, ...safe } = props;
    return React.createElement("img", safe);
  },
}));
vi.mock("next/link", () => ({
  default: ({ children, href, onNavigate: _onNavigate, prefetch: _prefetch, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("a", { ...props, href }, children),
}));

import { ProductCard } from "@/components/storefront/product-card";

const product = {
  id: "p1", slug: "demo-shirt", name: "Demo Shirt", brandName: null,
  image: null, basePrice: 100000, salePrice: null,
  ratingAvg: 0, reviewCount: 0, variantId: "v1",
};

describe("storefront product-card SSR markup", () => {
  it("has separate link and wishlist button in the parsed server HTML", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    expect(wrapper.querySelectorAll("a button")).toHaveLength(0);
    const wishlist = wrapper.querySelector('[data-testid="wishlist-toggle-p1"]');
    expect(wishlist).not.toBeNull();
    expect(wishlist!.closest("a")).toBeNull();
    expect(wrapper.querySelector('a[href="/product/demo-shirt"]')).not.toBeNull();
  });

  it("keeps a real wishlist button and product link, including featured behavior", () => {
    const view = render(<ProductCard product={product} />);
    expect(screen.getByRole("link", { name: "Lihat detail Demo Shirt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tambah ke wishlist" })).toBeTruthy();
    view.unmount();
    render(<ProductCard product={product} featured />);
    expect(screen.queryByRole("button", { name: "Tambah ke wishlist" })).toBeNull();
  });
});
