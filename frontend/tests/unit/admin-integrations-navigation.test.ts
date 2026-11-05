// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/integrations/jnt" }));
vi.mock("@/components/ui/navigation", () => ({ default: ({ children, prefetch: _prefetch, ...props }: any) => React.createElement("a", props, children) }));
import { AdminNav, AdminMobileBottomNav } from "@/components/admin/admin-nav";
afterEach(cleanup);
it("groups authorized desktop access as Integrasi then J&T Express", () => {
  render(React.createElement(AdminNav, { permissions: [], platformOwner: true }));
  expect(screen.getByRole("link", { name: "Integrasi" }).getAttribute("href")).toBe("/admin/integrations");
  expect(screen.getByRole("link", { name: "J&T Express" }).getAttribute("href")).toBe("/admin/integrations/jnt");
});
it("hides both integration entries from unauthorized users", () => {
  render(React.createElement(AdminNav, { permissions: ["shipping.update"] }));
  expect(screen.queryByRole("link", { name: "Integrasi" })).toBeNull();
  expect(screen.queryByRole("link", { name: "J&T Express" })).toBeNull();
});
it("keeps five mobile controls and exposes Integrasi only in Lainnya", () => {
  render(React.createElement(AdminMobileBottomNav, { platformOwner: true, permissions: ["product.read", "order.read", "inventory.read"] }));
  const nav = screen.getByRole("navigation", { name: "Navigasi bawah admin" });
  expect(nav.firstElementChild?.children.length).toBe(5);
  const more = nav.querySelector("details")!;
  expect(within(more).getByRole("link", { name: "Integrasi" }).getAttribute("href")).toBe("/admin/integrations");
});
