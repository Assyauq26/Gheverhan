import { test, expect } from "@playwright/test";

test("homepage shows hero and products", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-carousel")).toBeVisible();
  await expect(page.getByTestId("category-nav")).toBeVisible();
  await expect(page.locator('[data-testid^="product-card-"]').first()).toBeVisible();
});

test("customer can open a product detail", async ({ page }) => {
  await page.goto("/product/essential-tee");
  await expect(page.getByTestId("purchase-panel")).toBeVisible();
  await expect(page.getByTestId("add-to-cart-btn")).toBeVisible();
});
