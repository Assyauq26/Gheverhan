// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PERMISSIONS } from "@/lib/auth/permissions";

const route = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/components/ui/navigation", () => ({
  default: ({ children, prefetch: _prefetch, ...props }: React.PropsWithChildren<{ href: string; prefetch?: boolean }>) =>
    React.createElement("a", props, children),
}));

import { AdminMobileBottomNav, AdminNav } from "@/components/admin/admin-nav";
vi.stubGlobal("React", React);
afterEach(() => { cleanup(); route.pathname = "/admin"; });

describe("admin visual navigation: permission and route invariants", () => {
  const full = Object.values(PERMISSIONS);
  it("renders primary sidebar links, supports actual admin routes and keeps existing selectors", () => {
    render(React.createElement(AdminNav, { permissions: full }));
    expect(screen.getByTestId("adminnav-produk").getAttribute("href")).toBe("/admin/products");
    expect(screen.getByTestId("adminnav-inventori").getAttribute("href")).toBe("/admin/inventory");
    expect(screen.getByTestId("adminnav-marketing").getAttribute("href")).toBe("/admin/marketing");
    expect(screen.getByTestId("adminnav-dashboard").getAttribute("aria-current")).toBe("page");
  });
  it("does not expose restricted admin navigation for CS role", () => {
    render(React.createElement(AdminNav, { permissions: [PERMISSIONS.ORDER_READ, PERMISSIONS.CUSTOMER_READ] }));
    expect(screen.queryByTestId("adminnav-produk")).toBeNull();
    expect(screen.queryByTestId("adminnav-marketing")).toBeNull();
    expect(screen.getByTestId("adminnav-pesanan")).not.toBeNull();
  });
  it("provides mobile dashboard/products/orders/inventory and a More menu without fabricated routes", () => {
    route.pathname = "/admin/inventory";
    render(React.createElement(AdminMobileBottomNav, {
      permissions: [PERMISSIONS.PRODUCT_READ, PERMISSIONS.ORDER_READ, PERMISSIONS.INVENTORY_READ, PERMISSIONS.PAYMENT_READ],
    }));
    expect(screen.getByTestId("adminnav-inventori").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("adminnav-produk").getAttribute("href")).toBe("/admin/products");
    expect(screen.getByText("Lainnya")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Laporan" })).toBeNull();
  });
  it("retains permission-filtered sidebar and mobile bottom navigation on product routes", () => {
    route.pathname = "/admin/products";
    const sidebar = render(React.createElement(AdminNav, { permissions: full }));
    expect(sidebar.container.querySelectorAll('nav[aria-label="Navigasi admin"]')).toHaveLength(1);
    expect(screen.getByTestId("adminnav-produk").getAttribute("aria-current")).toBe("page");
    expect(sidebar.container.querySelector("nav")?.className).not.toContain("overflow-x-auto");
    sidebar.unmount();
    render(React.createElement(AdminMobileBottomNav, { permissions: full }));
    expect(screen.getByTestId("adminnav-produk").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Lainnya")).not.toBeNull();
  });
});
