// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => React.createElement("img", { alt }),
}));
const selection = vi.hoisted(() => ({
  image: null as null | { url: string; alt: string },
}));
vi.mock("@/components/storefront/product-selection", () => ({
  useProductSelection: () => selection,
}));
import { ProductGallery } from "@/components/storefront/product-gallery";
vi.stubGlobal("React", React);
afterEach(() => {
  cleanup();
  selection.image = null;
});
it("preserves focus when Home/End move the bounded dot window", () => {
  const images = Array.from({ length: 12 }, (_, i) => ({
    url: `/photo-${i}.webp`,
    alt: `Photo ${i}`,
  }));
  const view = render(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  const start = view.getByRole("button", {
    name: "Lihat foto produk 1 dari 12",
  });
  start.focus();
  fireEvent.keyDown(start, { key: "End" });
  const end = view.getByRole("button", {
    name: "Lihat foto produk 12 dari 12",
  });
  expect(end).toHaveFocus();
  expect(end).toHaveAttribute("aria-current", "true");
  expect(
    view.container.querySelectorAll(".pdp-gallery-dots button"),
  ).toHaveLength(5);
  fireEvent.keyDown(end, { key: "Home" });
  expect(
    view.getByRole("button", {
      name: "Lihat foto produk 1 dari 12",
    }),
  ).toHaveFocus();
});

it("does not steal option-control focus after repeated boundary keys", () => {
  const images = Array.from({ length: 12 }, (_, i) => ({
    url: `/photo-${i}.webp`,
    alt: `Photo ${i}`,
  }));
  const view = render(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  fireEvent.keyDown(
    view.getByRole("button", { name: "Lihat foto produk 1 dari 12" }),
    { key: "End" },
  );
  fireEvent.keyDown(
    view.getByRole("button", { name: "Lihat foto produk 12 dari 12" }),
    { key: "End" },
  );
  const option = document.createElement("button");
  document.body.appendChild(option);
  option.focus();
  selection.image = { url: "/option.webp", alt: "Selected option" };
  view.rerender(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  expect(option).toHaveFocus();
  option.remove();
});
