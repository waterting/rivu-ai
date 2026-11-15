import { test, expect } from "@playwright/test";

const AUTH_ROUTES = ["/login", "/signup", "/reset-password", "/verify-email"];

// Next.js injects its own route announcer with role="alert", so auth alerts must
// always be queried inside the labelled authentication region.
const authForm = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Authentication" });

// The split-screen shell keeps the document itself fixed on desktop and collapses
// to a single scrollable column below 900px. These checks guard that contract
// across viewports so form fields never clip and nothing overflows sideways.
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`auth layout @ ${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of AUTH_ROUTES) {
      test(`${route} fits the viewport without overflow`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const metrics = await page.evaluate(() => ({
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        }));

        expect(metrics.overflowX, "no horizontal overflow").toBeLessThanOrEqual(0);
        expect(metrics.overflowY, "no document scroll").toBeLessThanOrEqual(0);
      });

      test(`${route} keeps every field reachable`, async ({ page }) => {
        await page.goto(route);
        const fields = page.locator("input:not([type='hidden'])");
        const count = await fields.count();
        expect(count, "auth form has at least one field").toBeGreaterThan(0);

        for (let i = 0; i < count; i += 1) {
          await expect(fields.nth(i)).toBeVisible();
        }

        const submit = page.locator("button[type='submit']").first();
        if (await submit.count()) {
          await expect(submit).toBeVisible();
        }
      });
    }
  });
}

test.describe("auth visual panel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const route of AUTH_ROUTES) {
    test(`${route} renders the brand scene on desktop`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("[data-auth-visual]")).toBeVisible();
    });
  }
});

test.describe("auth visual panel on small screens", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of AUTH_ROUTES) {
    test(`${route} drops the visual panel on mobile`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("[data-auth-visual]")).toBeHidden();
    });
  }
});

test("login form validates and rejects empty credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await expect(authForm(page).getByRole("alert")).toBeVisible();
});

test("login and signup cross-link", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create a workspace" }).click();
  await expect(page).toHaveURL(/\/signup$/);

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("signup validates a malformed email", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Test User");
  await page.getByLabel("Username").fill("test-user");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("longenough123");
  await page.getByRole("button", { name: /Create workspace/ }).click();
  await expect(authForm(page).getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("reset-password switches between request and complete modes", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: /Recover your account/i })).toBeVisible();
  await expect(page.getByLabel("Work email")).toBeVisible();

  await page.goto("/reset-password?token=demo-token");
  await expect(page.getByRole("heading", { name: /Choose a new password/i })).toBeVisible();
  await expect(page.getByLabel("New password")).toBeVisible();
});
