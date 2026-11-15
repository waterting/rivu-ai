import { test, expect } from "@playwright/test";

test("homepage and services pages render and navigation works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make business data ready/i })).toBeVisible();
  await expect(page.getByText("The complete Rivu refinery.")).toBeVisible();
  await expect(page.getByText("See the refinery end to end")).toBeAttached();

  // The homepage nav now groups links under Platform/Solutions dropdowns, so the
  // services page is asserted directly rather than through a header button.
  await page.goto("/our-services");
  await expect(page.getByRole("heading", { name: /AI & data solutions/i })).toBeVisible();
  const catalogueLink = page.getByRole("link", { name: /Open Catalogue Data Entry/ });
  await expect(catalogueLink).toBeVisible();
  await catalogueLink.click();
  await expect(page).toHaveURL(/\/our-solutions\/catalogue-data-entry$/);
  await expect(page.getByRole("heading", { name: /Sign in to your catalogue/i })).toBeVisible();
  await expect(page.getByText(/separate from Rivu Data Refinery/i)).toBeVisible();
});
